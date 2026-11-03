import type { Express, Request, Response } from 'express';
import type { AgentRouteDeps } from '../agentTypes';
import type { AgentRouteHelpers } from './agentRouteHelpers';
import { sendError } from '../../utils/httpResponses';
import { listBrowserSessions, paginatedMeta } from '../agentDb';
import { getDailyAgentReport } from '../dailyReportService';
import { parsePagination } from '../agentValidation';

export function registerRuntimeRoutes(app: Express, deps: AgentRouteDeps, helpers: AgentRouteHelpers): void {
  const { getAuthUser, accessDefaults } = deps;
  const { requireManage, assertRecordAccess } = helpers;

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

  app.get('/api/agent/runtime', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { ControlPlane } = await import('../../modules/control-plane');
      const refreshMetrics =
        String(req.query.refresh || '').trim() === '1' ||
        String(req.query.refresh || '').trim().toLowerCase() === 'true';
      const data = await ControlPlane.getRuntime(user, { refreshMetrics });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được runtime observability.');
    }
  });

  app.get('/api/agent/fleet', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { opsGetFleet } = await import('../../modules/control-plane');
      const companyId = user.role === 'owner' ? null : user.company_id ?? null;
      const data = await opsGetFleet(companyId);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được fleet.');
    }
  });

  app.get('/api/agent/operations', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { opsGetOperationsMetrics } = await import('../../modules/control-plane');
      const companyId = user.role === 'owner' ? null : user.company_id ?? null;
      const refresh =
        String(req.query.refresh || '').trim() === '1' ||
        String(req.query.refresh || '').trim().toLowerCase() === 'true';
      const data = await opsGetOperationsMetrics({
        companyId,
        refresh,
        reason: refresh ? 'manual' : 'dashboard',
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được operations metrics.');
    }
  });

  app.get('/api/agent/agents', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { ControlPlane } = await import('../../modules/control-plane');
      const onlineOnly = String(req.query.onlineOnly || '').trim() === '1';
      const data = await ControlPlane.listAgents({
        companyId: user.role === 'owner' ? undefined : user.company_id ?? '__none__',
        onlineOnly,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được agent registry.');
    }
  });

  app.get('/api/agent/runtime/events', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { ControlPlane } = await import('../../modules/control-plane');
      const limit = Number(req.query.limit || 50);
      const data = await ControlPlane.listEvents({
        companyId: user.role === 'owner' ? undefined : user.company_id ?? null,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được runtime events.');
    }
  });

  app.get('/api/agent/reports/control-plane', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const { ControlPlane } = await import('../../modules/control-plane');
      const kindRaw = String(req.query.kind || 'daily').trim().toLowerCase();
      const allowed = new Set([
        'daily',
        'weekly',
        'campaign',
        'publish',
        'scanner',
        'runtime_health',
        'agent',
        'browser',
        'fleet',
        'failed',
      ]);
      const kind = allowed.has(kindRaw) ? kindRaw : 'daily';
      const date = String(req.query.date || '').trim() || undefined;
      const data = await ControlPlane.report(user, kind as never, { date });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được control-plane report.');
    }
  });

  /** Shared Command Engine — Web / CLI / any client */
  app.post('/api/agent/console/command', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const text = String(req.body?.text || req.body?.command || '').trim();
      if (!text) {
        sendError(res, 400, 'Thiếu text command.');
        return;
      }
      const { ControlPlane } = await import('../../modules/control-plane');
      const data = await ControlPlane.command(text, {
        user,
        companyId:
          typeof req.body?.companyId === 'string'
            ? req.body.companyId
            : user.company_id ?? null,
        client: 'web',
        triggeredBy: user.id,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Console command thất bại.');
    }
  });

  app.post('/api/agent/telegram/command', async (req: Request, res: Response) => {
    try {
      getAuthUser(req);
      const text = String(req.body?.text || req.body?.command || '').trim();
      if (!text) {
        sendError(res, 400, 'Thiếu text command.');
        return;
      }
      const { ControlPlane } = await import('../../modules/control-plane');
      const data = await ControlPlane.telegramCommand(text, {
        companyId: typeof req.body?.companyId === 'string' ? req.body.companyId : null,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Telegram command thất bại.');
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

  // ─── Spam & Block Rules (AI Scanner 2.0) ─────────────────────────────
}
