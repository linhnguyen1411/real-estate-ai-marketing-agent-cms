/**
 * Sales Layer API — pipeline, value KPIs, journey, learning.
 */

import type { Express, Request, Response } from 'express';
import {
  formatSalesDailyBriefing,
  getSalesPipelineMetrics,
  listSalesPipeline,
  processSalesLayer,
  recordSalesLearning,
  updateSalesPipelineStage,
} from '../salesService';
import { SALES_PIPELINE_STAGES, type SalesPipelineStage } from '../types';
import type { LearningOutcome } from '../../lead-acquisition/types';

const OUTCOMES: LearningOutcome[] = ['won', 'lost', 'spam', 'wrong'];

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerSalesLayerRoutes(app: Express): void {
  app.get('/api/sales/metrics', async (req: Request, res: Response) => {
    try {
      const companyId =
        typeof req.query.companyId === 'string' ? req.query.companyId : null;
      const sinceHours = Number(req.query.sinceHours || 720);
      const data = await getSalesPipelineMetrics({
        companyId,
        sinceHours: Number.isFinite(sinceHours) ? sinceHours : 720,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Metrics failed');
    }
  });

  app.get('/api/sales/briefing', async (req: Request, res: Response) => {
    try {
      const companyId =
        typeof req.query.companyId === 'string' ? req.query.companyId : null;
      const metrics = await getSalesPipelineMetrics({ companyId, sinceHours: 720 });
      res.json({
        status: 'success',
        data: { text: formatSalesDailyBriefing(metrics), metrics },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Briefing failed');
    }
  });

  app.get('/api/sales/pipeline', async (req: Request, res: Response) => {
    try {
      const companyId =
        typeof req.query.companyId === 'string' ? req.query.companyId : null;
      const limit = Number(req.query.limit || 200);
      const data = await listSalesPipeline({
        companyId,
        limit: Number.isFinite(limit) ? limit : 200,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Pipeline failed');
    }
  });

  app.post('/api/sales/:id/process', async (req: Request, res: Response) => {
    try {
      const profile = await processSalesLayer({
        findingId: req.params.id,
        notifyFollowUp: Boolean((req.body as { notify?: boolean })?.notify),
      });
      if (!profile) return sendError(res, 404, 'Finding not found or skipped');
      res.json({ status: 'success', data: profile });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Process failed');
    }
  });

  app.patch('/api/sales/:id/stage', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const stage = String(body.stage || '') as SalesPipelineStage;
      if (!SALES_PIPELINE_STAGES.includes(stage)) return sendError(res, 400, 'Invalid stage');
      const profile = await updateSalesPipelineStage({
        findingId: req.params.id,
        stage,
        actor: typeof body.actor === 'string' ? body.actor : 'admin-ui',
        owner: typeof body.owner === 'string' ? body.owner : undefined,
        expectedCloseAt:
          typeof body.expectedCloseAt === 'string' ? body.expectedCloseAt : undefined,
        probability: typeof body.probability === 'number' ? body.probability : undefined,
      });
      if (!profile) return sendError(res, 404, 'Finding not found');
      res.json({ status: 'success', data: profile });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Stage update failed');
    }
  });

  app.post('/api/sales/:id/learn', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const outcome = String(body.outcome || '') as LearningOutcome;
      if (!OUTCOMES.includes(outcome)) return sendError(res, 400, 'Invalid outcome');
      const profile = await recordSalesLearning({
        findingId: req.params.id,
        outcome,
        note: typeof body.note === 'string' ? body.note : undefined,
        actor: typeof body.actor === 'string' ? body.actor : 'admin-ui',
      });
      if (!profile) return sendError(res, 404, 'Finding not found');
      res.json({ status: 'success', data: profile });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Learning failed');
    }
  });
}
