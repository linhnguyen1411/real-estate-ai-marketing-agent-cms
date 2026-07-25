/**
 * H0.5 Executive Dashboard API
 */

import type { Express, Request, Response } from 'express';
import { buildExecutiveSnapshot, formatExecutiveDashboardLines } from '../executiveService';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerExecutiveDashboardRoutes(app: Express): void {
  app.get('/api/executive/snapshot', async (_req: Request, res: Response) => {
    try {
      res.json({ status: 'success', data: await buildExecutiveSnapshot() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Snapshot failed');
    }
  });

  app.get('/api/executive/briefing', async (_req: Request, res: Response) => {
    try {
      const snap = await buildExecutiveSnapshot();
      res.json({
        status: 'success',
        data: { text: formatExecutiveDashboardLines(snap).join('\n'), snapshot: snap },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Briefing failed');
    }
  });
}
