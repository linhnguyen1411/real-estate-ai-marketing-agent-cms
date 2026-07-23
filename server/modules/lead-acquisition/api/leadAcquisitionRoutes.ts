/**
 * Lead Acquisition Engine API — Lead Center pipeline + metrics + learning.
 */

import type { Express, Request, Response } from 'express';
import {
  getLeadAcquisitionMetrics,
  listLeadPipeline,
  processLeadAcquisition,
  updateLeadPipelineStage,
} from '../acquisitionService';
import { recordLeadLearning } from '../learningEngine';
import type { LeadPipelineStage, LearningOutcome } from '../types';

const STAGES: LeadPipelineStage[] = [
  'candidate',
  'qualified',
  'assigned',
  'contacted',
  'interested',
  'negotiating',
  'won',
  'lost',
];

const OUTCOMES: LearningOutcome[] = ['won', 'lost', 'spam', 'wrong'];

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerLeadAcquisitionRoutes(app: Express): void {
  app.get('/api/lead-acquisition/metrics', async (req: Request, res: Response) => {
    try {
      const companyId =
        typeof req.query.companyId === 'string' ? req.query.companyId : null;
      const sinceHours = Number(req.query.sinceHours || 24);
      const data = await getLeadAcquisitionMetrics({
        companyId,
        sinceHours: Number.isFinite(sinceHours) ? sinceHours : 24,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Metrics failed');
    }
  });

  app.get('/api/lead-acquisition/pipeline', async (req: Request, res: Response) => {
    try {
      const companyId =
        typeof req.query.companyId === 'string' ? req.query.companyId : null;
      const limit = Number(req.query.limit || 200);
      const data = await listLeadPipeline({
        companyId,
        limit: Number.isFinite(limit) ? limit : 200,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Pipeline failed');
    }
  });

  app.post('/api/lead-acquisition/:id/process', async (req: Request, res: Response) => {
    try {
      const profile = await processLeadAcquisition({
        findingId: req.params.id,
        notifyTelegram: Boolean((req.body as { notify?: boolean })?.notify),
      });
      if (!profile) return sendError(res, 404, 'Finding not found or skipped');
      res.json({ status: 'success', data: profile });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Process failed');
    }
  });

  app.patch('/api/lead-acquisition/:id/stage', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const stage = String(body.stage || '') as LeadPipelineStage;
      if (!STAGES.includes(stage)) return sendError(res, 400, 'Invalid stage');
      const profile = await updateLeadPipelineStage({
        findingId: req.params.id,
        stage,
        actor: typeof body.actor === 'string' ? body.actor : 'admin-ui',
      });
      if (!profile) return sendError(res, 404, 'Finding not found');
      res.json({ status: 'success', data: profile });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Stage update failed');
    }
  });

  app.post('/api/lead-acquisition/:id/learn', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const outcome = String(body.outcome || '') as LearningOutcome;
      if (!OUTCOMES.includes(outcome)) return sendError(res, 400, 'Invalid outcome');
      const profile = await recordLeadLearning({
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
