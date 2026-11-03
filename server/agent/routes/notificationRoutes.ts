import type { Express, Request, Response } from 'express';
import type { AgentRouteDeps } from '../agentTypes';
import type { AgentRouteHelpers } from './agentRouteHelpers';
import { sendError } from '../../utils/httpResponses';
import { getAgentNotificationById, listAgentNotifications, markAllAgentNotificationsRead, markNotificationRead, countUnreadAgentNotifications, paginatedMeta } from '../agentDb';
import { parsePagination } from '../agentValidation';

export function registerNotificationRoutes(app: Express, deps: AgentRouteDeps, helpers: AgentRouteHelpers): void {
  const { getAuthUser, accessDefaults } = deps;
  const { requireManage, assertRecordAccess } = helpers;

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

}
