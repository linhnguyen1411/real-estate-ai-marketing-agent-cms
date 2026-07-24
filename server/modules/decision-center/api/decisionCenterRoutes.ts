/**
 * Decision Center HTTP API.
 */

import type { Express, Request, Response } from 'express';
import {
  buildDecisionSnapshot,
  evaluateTextDecision,
  getDecisionReportText,
  processFindingDecision,
} from '../decisionService';
import {
  deleteDecisionRule,
  exportDecisionLibrary,
  getDecisionMetrics,
  importDecisionRules,
  listDecisionRules,
  resetDecisionRulesToDefault,
  upsertDecisionRule,
} from '../store';
import type { DecisionRule } from '../types';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerDecisionCenterRoutes(app: Express): void {
  app.get('/api/decision-center/snapshot', async (_req: Request, res: Response) => {
    try {
      res.json({ status: 'success', data: await buildDecisionSnapshot() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Snapshot failed');
    }
  });

  app.get('/api/decision-center/metrics', async (_req: Request, res: Response) => {
    try {
      res.json({ status: 'success', data: await getDecisionMetrics() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Metrics failed');
    }
  });

  app.get('/api/decision-center/report', async (_req: Request, res: Response) => {
    try {
      const text = await getDecisionReportText();
      res.json({ status: 'success', data: { text, metrics: await getDecisionMetrics() } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Report failed');
    }
  });

  app.get('/api/decision-center/rules', async (_req: Request, res: Response) => {
    try {
      res.json({ status: 'success', data: await listDecisionRules() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Rules failed');
    }
  });

  app.post('/api/decision-center/rules', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Partial<DecisionRule>;
      if (!body.keyword || typeof body.weight !== 'number') {
        return sendError(res, 400, 'keyword and weight required');
      }
      const rule: DecisionRule = {
        id: String(body.id || `rule_${Date.now()}`),
        group: String(body.group || 'Custom'),
        keyword: String(body.keyword).trim(),
        weight: Number(body.weight),
        category: (body.category || 'signal') as DecisionRule['category'],
        enabled: body.enabled !== false,
        priority: typeof body.priority === 'number' ? body.priority : 100,
      };
      const rules = await upsertDecisionRule(rule);
      res.json({ status: 'success', data: rules });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Upsert failed');
    }
  });

  app.delete('/api/decision-center/rules/:id', async (req: Request, res: Response) => {
    try {
      const rules = await deleteDecisionRule(String(req.params.id));
      res.json({ status: 'success', data: rules });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Delete failed');
    }
  });

  app.post('/api/decision-center/rules/import', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { rules?: DecisionRule[] };
      if (!Array.isArray(body.rules)) return sendError(res, 400, 'rules array required');
      const rules = await importDecisionRules(body.rules);
      res.json({ status: 'success', data: rules });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Import failed');
    }
  });

  app.get('/api/decision-center/rules/export', async (_req: Request, res: Response) => {
    try {
      res.json({ status: 'success', data: await exportDecisionLibrary() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Export failed');
    }
  });

  app.post('/api/decision-center/rules/reset', async (_req: Request, res: Response) => {
    try {
      res.json({ status: 'success', data: await resetDecisionRulesToDefault() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Reset failed');
    }
  });

  app.post('/api/decision-center/evaluate', async (req: Request, res: Response) => {
    try {
      const text = String((req.body || {}).text || '').trim();
      if (!text) return sendError(res, 400, 'text is required');
      res.json({ status: 'success', data: await evaluateTextDecision(text) });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Evaluate failed');
    }
  });

  app.post('/api/decision-center/findings/:id/decide', async (req: Request, res: Response) => {
    try {
      const data = await processFindingDecision(String(req.params.id));
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Decide failed');
    }
  });
}
