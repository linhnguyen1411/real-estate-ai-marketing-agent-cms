/**
 * Marketing Organization API.
 */

import type { Express, Request, Response } from 'express';
import {
  buildMarketingSnapshot,
  createFactoryPack,
  createReusePlan,
  formatMarketingBriefing,
} from '../marketingService';
import { buildWeeklyContentCalendar } from '../contentCalendar';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerMarketingOrgRoutes(app: Express): void {
  app.get('/api/marketing-org/snapshot', async (req: Request, res: Response) => {
    try {
      const companyId =
        typeof req.query.companyId === 'string' ? req.query.companyId : null;
      const topic = typeof req.query.topic === 'string' ? req.query.topic : null;
      const data = await buildMarketingSnapshot({ companyId, topic });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Snapshot failed');
    }
  });

  app.get('/api/marketing-org/briefing', async (req: Request, res: Response) => {
    try {
      const companyId =
        typeof req.query.companyId === 'string' ? req.query.companyId : null;
      const snapshot = await buildMarketingSnapshot({ companyId });
      res.json({
        status: 'success',
        data: { text: formatMarketingBriefing(snapshot), snapshot },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Briefing failed');
    }
  });

  app.get('/api/marketing-org/calendar', async (req: Request, res: Response) => {
    try {
      const topic =
        typeof req.query.topic === 'string' ? req.query.topic : 'Mai Đăng Chơn';
      res.json({
        status: 'success',
        data: buildWeeklyContentCalendar({ topic }),
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Calendar failed');
    }
  });

  app.post('/api/marketing-org/factory', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const topic = String(body.topic || '').trim();
      if (!topic) return sendError(res, 400, 'topic is required');
      const pack = await createFactoryPack({
        topic,
        campaignHint: typeof body.campaignHint === 'string' ? body.campaignHint : topic,
        usp: typeof body.usp === 'string' ? body.usp : null,
      });
      res.json({ status: 'success', data: pack });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Factory failed');
    }
  });

  app.post('/api/marketing-org/reuse', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const sourceTitle = String(body.sourceTitle || body.title || '').trim();
      if (!sourceTitle) return sendError(res, 400, 'sourceTitle is required');
      const plan = await createReusePlan({
        sourceTitle,
        topic: typeof body.topic === 'string' ? body.topic : undefined,
      });
      res.json({ status: 'success', data: plan });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Reuse failed');
    }
  });
}
