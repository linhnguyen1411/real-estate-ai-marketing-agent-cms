import type { Express, Request, Response } from 'express';
import type { AgentRouteDeps } from '../agentTypes';
import type { AgentRouteHelpers } from './agentRouteHelpers';
import { sendError } from '../../utils/httpResponses';
import { Prisma } from '@prisma/client';
import { cancelQueuedJobsForSource, createAgentSource, forceDeleteAgentSource, getAgentDashboardCounts, getAgentSourceById, listAgentSources, paginatedMeta, updateAgentSource } from '../agentDb';
import { enqueueSourceScan } from '../agentJobService';
import { parsePagination, validateSourceCreate, validateSourcePatch } from '../agentValidation';

function isPrismaUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function registerSourceRoutes(app: Express, deps: AgentRouteDeps, helpers: AgentRouteHelpers): void {
  const { getAuthUser, accessDefaults } = deps;
  const { requireManage, assertRecordAccess } = helpers;

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
      if (patch.status === 'paused' && existing.status === 'active') {
        await cancelQueuedJobsForSource(existing.id);
      }
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

      const result = await forceDeleteAgentSource(existing.id);
      res.json({
        status: 'success',
        data: result.record,
        meta: {
          deleted: result.deleted,
          message: `Đã xóa nguồn cùng ${result.deleted.jobs} job, ${result.deleted.scannedContents} nội dung đã quét, ${result.deleted.findings} finding.`,
        },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không xóa được nguồn.');
    }
  });

}
