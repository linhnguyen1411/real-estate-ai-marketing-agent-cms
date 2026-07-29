/**
 * H0.5 Executive Dashboard API
 */

import type { Express, Request, Response } from 'express';
import {
  buildExecutiveSnapshot,
  formatExecutiveDashboardLines,
  listExecutiveDrilldown,
} from '../executiveService';
import { prisma } from '../../../prisma';

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

  app.get('/api/executive/sources/:id/performance', async (req: Request, res: Response) => {
    try {
      const snap = await buildExecutiveSnapshot();
      const row = snap.sourcePerformance.find(s => s.sourceId === req.params.id);
      if (!row) return sendError(res, 404, 'Source not found in executive snapshot');
      res.json({ status: 'success', data: row });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Source performance failed');
    }
  });

  app.get('/api/executive/sources/:id/history', async (req: Request, res: Response) => {
    try {
      const sourceId = String(req.params.id || '').trim();
      const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)));
      const jobs = await prisma.agentJob.findMany({
        where: {
          sourceId,
          type: { in: ['scan_source', 'source_scan'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          status: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
          updatedAt: true,
          errorMessage: true,
        },
      });
      const data = jobs.map(j => ({
        jobId: j.id,
        status: j.status,
        startedAt: j.startedAt ? j.startedAt.toISOString() : null,
        finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
        updatedAt: j.updatedAt.toISOString(),
        durationMs:
          j.startedAt && (j.finishedAt || j.updatedAt)
            ? (j.finishedAt || j.updatedAt).getTime() - j.startedAt.getTime()
            : null,
        error: j.errorMessage || null,
      }));
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Source history failed');
    }
  });

  app.get('/api/executive/buyers', async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page || 0);
      const limit = Number(req.query.limit || 50);
      const data = await listExecutiveDrilldown({ kind: 'buyers', page, limit });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Executive buyers failed');
    }
  });

  app.get('/api/executive/qualified', async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page || 0);
      const limit = Number(req.query.limit || 50);
      const data = await listExecutiveDrilldown({ kind: 'qualified', page, limit });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Executive qualified failed');
    }
  });

  app.get('/api/executive/urgent-buyers', async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page || 0);
      const limit = Number(req.query.limit || 50);
      const data = await listExecutiveDrilldown({ kind: 'urgent', page, limit });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Executive urgent failed');
    }
  });
}
