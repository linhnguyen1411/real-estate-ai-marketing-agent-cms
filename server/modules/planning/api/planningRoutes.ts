/**
 * Planning / AI Sales Employee API + Campaign Runtime (H2.1).
 */

import type { Express, Request, Response } from 'express';
import {
  approveCampaign,
  completeCampaign,
  getCampaign,
  listCampaigns,
  listCampaignsKanban,
  rejectCampaign,
} from '../campaignRuntime';
import { detectSalesMode, runSalesEmployee } from '../salesEmployee';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerPlanningRoutes(app: Express): void {
  app.post('/api/planning/ai-employee', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const utterance = String(body.utterance || body.text || '').trim();
      if (!utterance) return sendError(res, 400, 'utterance is required');
      const companyId =
        typeof body.companyId === 'string' ? body.companyId : null;
      const modeRaw = typeof body.mode === 'string' ? body.mode : undefined;
      const mode = modeRaw as ReturnType<typeof detectSalesMode> | undefined;
      const result = await runSalesEmployee({ utterance, companyId, mode });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'AI employee failed');
    }
  });

  app.get('/api/planning/campaigns', async (req: Request, res: Response) => {
    try {
      const companyId =
        typeof req.query.companyId === 'string' ? req.query.companyId : null;
      const kanban = String(req.query.kanban || '') === '1' || String(req.query.view || '') === 'kanban';
      if (kanban) {
        const board = await listCampaignsKanban({ companyId });
        return res.json({ status: 'success', data: board });
      }
      const rows = await listCampaigns({ companyId });
      res.json({ status: 'success', data: rows });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'List campaigns failed');
    }
  });

  app.get('/api/planning/campaigns/:id/tasks', async (req: Request, res: Response) => {
    try {
      const row = await getCampaign(req.params.id);
      if (!row) return sendError(res, 404, 'Campaign not found');
      const tasks = row.state.orchestratorTasks || [];
      const { orchestratorProgress, taskDurationMs, listReadyTasks } = await import(
        '../taskOrchestrator'
      );
      const progress = orchestratorProgress(tasks);
      res.json({
        status: 'success',
        data: {
          campaignId: row.id,
          name: row.name,
          status: row.status,
          tasks: tasks.map(t => ({
            ...t,
            durationMs: taskDurationMs(t),
          })),
          progress,
          ready: listReadyTasks(tasks).map(t => t.key),
          timeline: row.state.operationalMemory,
        },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Tasks failed');
    }
  });

  app.get('/api/planning/campaigns/:id', async (req: Request, res: Response) => {
    try {
      const row = await getCampaign(req.params.id);
      if (!row) return sendError(res, 404, 'Campaign not found');
      res.json({ status: 'success', data: row });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Get campaign failed');
    }
  });

  app.post('/api/planning/campaigns/:id/approve', async (req: Request, res: Response) => {
    try {
      const row = await approveCampaign({
        campaignId: req.params.id,
        actor: typeof req.body?.actor === 'string' ? req.body.actor : 'admin',
      });
      res.json({ status: 'success', data: row });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Approve failed');
    }
  });

  app.post('/api/planning/campaigns/:id/reject', async (req: Request, res: Response) => {
    try {
      const row = await rejectCampaign({
        campaignId: req.params.id,
        actor: typeof req.body?.actor === 'string' ? req.body.actor : 'admin',
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      });
      res.json({ status: 'success', data: row });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Reject failed');
    }
  });

  app.post('/api/planning/campaigns/:id/complete', async (req: Request, res: Response) => {
    try {
      const row = await completeCampaign(req.params.id);
      res.json({ status: 'success', data: row });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Complete failed');
    }
  });

  app.get('/api/planning/health', (_req: Request, res: Response) => {
    res.json({
      status: 'success',
      data: {
        service: 'ai-sales-employee-planning',
        layer: 'copilot+planning+campaign-runtime',
        runtimeUntouched: true,
      },
    });
  });
}
