import type { Express, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { AgentRouteDeps } from './agentTypes';
import {
  canAccessAgentRecord,
  canManageAgentConfig,
  createAgentMission,
  createAgentSource,
  deleteOrPauseAgentSource,
  getAgentDashboardCounts,
  getAgentFindingById,
  getAgentMissionById,
  getAgentNotificationById,
  getAgentSourceById,
  listAgentFindings,
  listAgentJobs,
  listAgentMissions,
  listAgentNotifications,
  listAgentSources,
  listBrowserSessions,
  markNotificationRead,
  paginatedMeta,
  updateAgentFinding,
  updateAgentMission,
  updateAgentSource,
} from './agentDb';
import { enqueueMissionRun, enqueueSourceScan } from './agentJobService';
import {
  parsePagination,
  validateFindingPatch,
  validateMissionCreate,
  validateMissionPatch,
  validateSourceCreate,
  validateSourcePatch,
} from './agentValidation';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

function isPrismaUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function registerAgentAdminRoutes(app: Express, deps: AgentRouteDeps) {
  const { getAuthUser, accessDefaults } = deps;

  function requireManage(req: Request, res: Response): boolean {
    const user = getAuthUser(req);
    if (!canManageAgentConfig(user)) {
      sendError(res, 403, 'Bạn không có quyền quản lý AI Agent.');
      return false;
    }
    return true;
  }

  function assertRecordAccess(
    req: Request,
    res: Response,
    companyId: string | null | undefined,
  ): boolean {
    const user = getAuthUser(req);
    if (!canAccessAgentRecord(user, companyId)) {
      sendError(res, 403, 'Bạn không có quyền truy cập dữ liệu này.');
      return false;
    }
    return true;
  }

  app.get('/api/agent/dashboard', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const data = await getAgentDashboardCounts(user);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được dashboard.');
    }
  });

  app.get('/api/agent/sources', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        status: String(req.query.status || '').trim() || undefined,
        type: String(req.query.type || '').trim() || undefined,
        search: String(req.query.search || '').trim() || undefined,
      };
      const { items, total } = await listAgentSources(user, pagination, filters);
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được danh sách nguồn.');
    }
  });

  app.post('/api/agent/sources', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    const validated = validateSourceCreate(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const defaults = accessDefaults(req, req.body);
      const created = await createAgentSource({
        companyId: defaults.company_id,
        name: validated.value.name,
        type: validated.value.type,
        url: validated.value.url,
        status: validated.value.status ?? 'active',
        priority: validated.value.priority ?? 5,
        scanIntervalMinutes: validated.value.scanIntervalMinutes ?? 60,
        config: (validated.value.config ?? {}) as Prisma.InputJsonValue,
        checkpoint: validated.value.checkpoint === null
          ? Prisma.JsonNull
          : (validated.value.checkpoint as Prisma.InputJsonValue | undefined),
        nextScanAt: new Date(),
      });
      res.json({ status: 'success', data: created });
    } catch (error: unknown) {
      if (isPrismaUniqueError(error)) {
        sendError(res, 409, 'URL nguồn đã tồn tại trong company này.');
        return;
      }
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được nguồn.');
    }
  });

  app.patch('/api/agent/sources/:id', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    const validated = validateSourcePatch(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const existing = await getAgentSourceById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy nguồn.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const patch = validated.value as Prisma.AgentSourceUpdateInput;
      const updated = await updateAgentSource(existing.id, patch);
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      if (isPrismaUniqueError(error)) {
        sendError(res, 409, 'URL nguồn đã tồn tại trong company này.');
        return;
      }
      sendError(res, 500, error instanceof Error ? error.message : 'Không cập nhật được nguồn.');
    }
  });

  app.post('/api/agent/sources/:id/run', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    try {
      const user = getAuthUser(req);
      const existing = await getAgentSourceById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy nguồn.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const missionId = String(req.body?.missionId || req.body?.mission_id || '').trim() || undefined;
      const result = await enqueueSourceScan({
        sourceId: existing.id,
        companyId: existing.companyId ?? user.company_id ?? 'comp-da-nang',
        triggeredByUserId: user.id,
        missionId,
      });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không enqueue được quét nguồn.');
    }
  });

  app.delete('/api/agent/sources/:id', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    try {
      const existing = await getAgentSourceById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy nguồn.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const result = await deleteOrPauseAgentSource(existing.id);
      res.json({
        status: 'success',
        data: result.record,
        meta: {
          softPaused: result.softPaused,
          message: result.softPaused
            ? 'Nguồn có dữ liệu phụ thuộc — đã chuyển sang paused thay vì xóa.'
            : 'Đã xóa nguồn.',
        },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không xóa được nguồn.');
    }
  });

  app.get('/api/agent/missions', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status = String(req.query.status || '').trim() || undefined;
      const { items, total } = await listAgentMissions(user, pagination, status);
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được danh sách mission.');
    }
  });

  app.post('/api/agent/missions', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    const validated = validateMissionCreate(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const defaults = accessDefaults(req, req.body);
      const created = await createAgentMission({
        companyId: defaults.company_id,
        ownerUserId: defaults.owner_user_id,
        name: validated.value.name,
        objective: validated.value.objective,
        status: validated.value.status ?? 'draft',
        rules: (validated.value.rules ?? {}) as Prisma.InputJsonValue,
        schedule: validated.value.schedule === null
          ? Prisma.JsonNull
          : (validated.value.schedule as Prisma.InputJsonValue | undefined),
      });
      res.json({ status: 'success', data: created });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được mission.');
    }
  });

  app.patch('/api/agent/missions/:id', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    const validated = validateMissionPatch(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const existing = await getAgentMissionById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy mission.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const patch = validated.value as Prisma.AgentMissionUpdateInput;
      const updated = await updateAgentMission(existing.id, patch);
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không cập nhật được mission.');
    }
  });

  app.post('/api/agent/missions/:id/run', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    try {
      const user = getAuthUser(req);
      const mission = await getAgentMissionById(req.params.id);
      if (!mission) {
        sendError(res, 404, 'Không tìm thấy mission.');
        return;
      }
      if (!assertRecordAccess(req, res, mission.companyId)) return;

      const result = await enqueueMissionRun({
        missionId: mission.id,
        companyId: mission.companyId ?? user.company_id ?? 'comp-da-nang',
        triggeredByUserId: user.id,
      });

      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Không enqueue được mission.');
    }
  });

  app.get('/api/agent/jobs', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        status: String(req.query.status || '').trim() || undefined,
        type: String(req.query.type || '').trim() || undefined,
        sourceId: String(req.query.sourceId || req.query.source_id || '').trim() || undefined,
        missionId: String(req.query.missionId || req.query.mission_id || '').trim() || undefined,
      };
      const { items, total } = await listAgentJobs(user, pagination, filters);
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được danh sách job.');
    }
  });

  app.get('/api/agent/findings', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const minScoreRaw = req.query.minScore ?? req.query.min_score;
      const minScore = minScoreRaw !== undefined ? Number(minScoreRaw) : undefined;
      const filters = {
        minScore: Number.isFinite(minScore) ? minScore : undefined,
        status: String(req.query.status || '').trim() || undefined,
        type: String(req.query.type || '').trim() || undefined,
        sourceId: String(req.query.sourceId || req.query.source_id || '').trim() || undefined,
      };
      const { items, total } = await listAgentFindings(user, pagination, filters);
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được danh sách finding.');
    }
  });

  app.patch('/api/agent/findings/:id', async (req: Request, res: Response) => {
    const validated = validateFindingPatch(req.body || {});
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const existing = await getAgentFindingById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      if (validated.value.status === 'promoted' && !canManageAgentConfig(getAuthUser(req))) {
        sendError(res, 403, 'Chỉ owner/company admin mới được promote finding.');
        return;
      }

      const updated = await updateAgentFinding(existing.id, validated.value);
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không cập nhật được finding.');
    }
  });

  app.get('/api/agent/notifications', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status = String(req.query.status || '').trim() || undefined;
      const { items, total } = await listAgentNotifications(user, pagination, { status });
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được thông báo.');
    }
  });

  app.patch('/api/agent/notifications/:id/read', async (req: Request, res: Response) => {
    try {
      const existing = await getAgentNotificationById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy thông báo.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const user = getAuthUser(req);
      if (user.role === 'member' && existing.userId && existing.userId !== user.id) {
        sendError(res, 403, 'Bạn không có quyền đọc thông báo này.');
        return;
      }

      const updated = await markNotificationRead(existing.id);
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không cập nhật được thông báo.');
    }
  });

  app.get('/api/agent/sessions', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status = String(req.query.status || '').trim() || undefined;
      const { items, total } = await listBrowserSessions(user, pagination, { status });
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được browser sessions.');
    }
  });
}
