/**
 * Planning / AI Sales Employee API (advisory boards).
 */

import type { Express, Request, Response } from 'express';
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

  app.get('/api/planning/health', (_req: Request, res: Response) => {
    res.json({
      status: 'success',
      data: {
        service: 'ai-sales-employee-planning',
        layer: 'copilot+planning',
        runtimeUntouched: true,
      },
    });
  });
}
