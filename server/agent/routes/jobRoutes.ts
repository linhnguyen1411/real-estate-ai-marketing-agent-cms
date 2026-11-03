import type { Express, Request, Response } from 'express';
import type { AgentRouteDeps } from '../agentTypes';
import type { AgentRouteHelpers } from './agentRouteHelpers';
import { sendError } from '../../utils/httpResponses';
import { deleteAgentJob, deleteAgentJobsByStatus, getAgentJobById, listAgentJobs, paginatedMeta } from '../agentDb';
import { parsePagination } from '../agentValidation';

export function registerJobRoutes(app: Express, deps: AgentRouteDeps, helpers: AgentRouteHelpers): void {
  const { getAuthUser, accessDefaults } = deps;
  const { requireManage, assertRecordAccess } = helpers;

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

  // Bulk cleanup of terminal (completed/failed) jobs. Never touches running jobs.
  app.post('/api/agent/jobs/cleanup', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;
    try {
      const user = getAuthUser(req);
      const sourceId = String(req.body?.sourceId || req.body?.source_id || '').trim() || undefined;
      const statuses = Array.isArray(req.body?.statuses)
        ? (req.body.statuses as unknown[]).map(String)
        : undefined;
      const count = await deleteAgentJobsByStatus({
        companyId: user.company_id ?? undefined,
        sourceId,
        statuses,
      });
      res.json({ status: 'success', data: { deleted: count } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không dọn được job.');
    }
  });

  app.delete('/api/agent/jobs/:id', async (req: Request, res: Response) => {
    if (!requireManage(req, res)) return;
    try {
      const existing = await getAgentJobById(req.params.id);
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy job.');
        return;
      }
      if (!assertRecordAccess(req, res, existing.companyId)) return;
      if (existing.status === 'running' || existing.status === 'claimed') {
        sendError(res, 409, 'Không thể xóa job đang chạy. Đợi job kết thúc rồi xóa.');
        return;
      }
      await deleteAgentJob(existing.id);
      res.json({ status: 'success', data: { id: existing.id } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không xóa được job.');
    }
  });

}
