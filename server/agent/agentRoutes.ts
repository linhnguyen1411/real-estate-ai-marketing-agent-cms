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
  listScannedContents,
  markAllAgentNotificationsRead,
  markNotificationRead,
  countUnreadAgentNotifications,
  paginatedMeta,
  updateAgentFinding,
  updateAgentMission,
  updateAgentSource,
} from './agentDb';
import { enqueueMissionRun, enqueueSourceScan } from './agentJobService';
import { getDailyAgentReport } from './dailyReportService';
import {
  buildMissionPayloadFromTemplate,
  getMissionTemplateById,
  listMissionTemplates,
} from './missionTemplates';
import {
  approveProposal,
  copyProposalText,
  createProposalsFromFinding,
  getActionProposalById,
  isValidActionType,
  isValidProposalStatus,
  listActionProposals,
  listProposalAudits,
  rejectProposal,
  updateProposalDraft,
} from './actionProposalService';
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

  app.get('/api/agent/missions/templates', async (_req: Request, res: Response) => {
    try {
      res.json({ status: 'success', data: listMissionTemplates() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được templates.');
    }
  });

  app.post('/api/agent/missions/from-template', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;

    const body = (req.body || {}) as Record<string, unknown>;
    const templateId = String(body.templateId ?? '').trim();
    if (!templateId) {
      sendError(res, 400, 'templateId là bắt buộc.');
      return;
    }

    const template = getMissionTemplateById(templateId);
    if (!template) {
      sendError(res, 404, 'Không tìm thấy mission template.');
      return;
    }

    const sourceIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.map(id => String(id).trim()).filter(Boolean)
      : undefined;
    const status = body.status !== undefined ? String(body.status).trim() : 'draft';

    const payload = buildMissionPayloadFromTemplate(template, {
      sourceIds,
      name: body.name !== undefined ? String(body.name) : undefined,
      objective: body.objective !== undefined ? String(body.objective) : undefined,
      status,
    });

    const validated = validateMissionCreate(payload);
    if (validated.ok === false) {
      sendError(res, 400, validated.message);
      return;
    }

    try {
      const defaults = accessDefaults(req, body);
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
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được mission từ template.');
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

  app.get('/api/agent/scanned-contents', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const filters = {
        sourceId: String(req.query.sourceId || req.query.source_id || '').trim() || undefined,
        status: String(req.query.status || '').trim() || undefined,
        search: String(req.query.search || '').trim() || undefined,
      };
      const { items, total } = await listScannedContents(user, pagination, filters);
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được nội dung đã quét.');
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

  app.post('/api/agent/findings/:id/action-proposals', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getAgentFindingById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy finding.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const body = (req.body || {}) as Record<string, unknown>;
      const actionType = body.actionType !== undefined ? String(body.actionType).trim() : undefined;
      if (actionType && !isValidActionType(actionType)) {
        sendError(res, 400, 'actionType không hợp lệ.');
        return;
      }

      const created = await createProposalsFromFinding({
        user,
        findingId: existing.id,
        actionType,
        count: body.count !== undefined ? Number(body.count) : undefined,
      });
      res.json({ status: 'success', data: created });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được đề xuất phản hồi.');
    }
  });

  app.get('/api/agent/action-proposals', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const status = String(req.query.status || '').trim() || undefined;
      if (status && !isValidProposalStatus(status)) {
        sendError(res, 400, 'status không hợp lệ.');
        return;
      }
      const actionType = String(req.query.actionType || req.query.action_type || '').trim() || undefined;
      if (actionType && !isValidActionType(actionType)) {
        sendError(res, 400, 'actionType không hợp lệ.');
        return;
      }
      const findingId = String(req.query.findingId || req.query.finding_id || '').trim() || undefined;

      const { items, total } = await listActionProposals(user, pagination, {
        status,
        actionType,
        findingId,
      });
      res.json({
        status: 'success',
        data: items,
        meta: paginatedMeta(total, pagination),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được hàng chờ đề xuất.');
    }
  });

  app.get('/api/agent/action-proposals/:id', async (req: Request, res: Response) => {
    try {
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      res.json({ status: 'success', data: existing });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được đề xuất.');
    }
  });

  app.patch('/api/agent/action-proposals/:id', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const body = (req.body || {}) as Record<string, unknown>;
      const updated = await updateProposalDraft({
        user,
        proposalId: existing.id,
        draftText: body.draftText !== undefined ? String(body.draftText) : undefined,
        rationale: body.rationale !== undefined ? String(body.rationale) : undefined,
        riskLevel: body.riskLevel !== undefined ? String(body.riskLevel) : undefined,
        actionType: body.actionType !== undefined ? String(body.actionType) : undefined,
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không cập nhật được đề xuất.';
      sendError(res, message.includes('Chỉ sửa') ? 400 : 500, message);
    }
  });

  app.post('/api/agent/action-proposals/:id/approve', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const updated = await approveProposal({ user, proposalId: existing.id });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không approve được đề xuất.';
      sendError(res, message.includes('Chỉ approve') ? 400 : 500, message);
    }
  });

  app.post('/api/agent/action-proposals/:id/reject', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const reason = (req.body as { reason?: string } | undefined)?.reason;
      const updated = await rejectProposal({
        user,
        proposalId: existing.id,
        reason: reason !== undefined ? String(reason) : undefined,
      });
      res.json({ status: 'success', data: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không reject được đề xuất.';
      sendError(res, message.includes('Không reject') ? 400 : 500, message);
    }
  });

  app.post('/api/agent/action-proposals/:id/copy', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;

      const markApproved = Boolean((req.body as { markApproved?: boolean } | undefined)?.markApproved);
      const result = await copyProposalText({
        user,
        proposalId: existing.id,
        markApproved,
      });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không copy được đề xuất.';
      sendError(res, message.includes('Không copy') ? 400 : 500, message);
    }
  });

  app.get('/api/agent/action-proposals/:id/audits', async (req: Request, res: Response) => {
    try {
      const existing = await getActionProposalById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy đề xuất.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      const audits = await listProposalAudits(existing.id);
      res.json({ status: 'success', data: audits });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được audit log.');
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

  app.get('/api/agent/notifications/unread-count', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const unread = await countUnreadAgentNotifications(user);
      res.json({ status: 'success', data: { unread } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không đếm được thông báo.');
    }
  });

  app.patch('/api/agent/notifications/read-all', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const updated = await markAllAgentNotificationsRead(user);
      res.json({ status: 'success', data: { updated } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không đánh dấu đã đọc.');
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

  app.get('/api/agent/reports/daily', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const date = String(req.query.date || '').trim() || undefined;
      const includeAiRaw = String(req.query.includeAiSummary ?? 'true').trim().toLowerCase();
      const includeAiSummary = includeAiRaw !== '0' && includeAiRaw !== 'false' && includeAiRaw !== 'no';

      const report = await getDailyAgentReport(user, { date, includeAiSummary });
      res.json({ status: 'success', data: report });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được báo cáo ngày.');
    }
  });
}
