/**
 * H0.6 Execution Trace HTTP API
 */

import type { Express, Request, Response } from 'express';
import {
  buildExecutionAnalytics,
  formatTraceSummaryLines,
  formatTraceTimelineLines,
  getLatestTraceForCampaign,
  getTrace,
  listTraces,
  resolveTraceForQuery,
} from '../traceService';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerExecutionTraceRoutes(app: Express): void {
  app.get('/api/execution-trace/analytics', async (_req: Request, res: Response) => {
    try {
      res.json({ status: 'success', data: await buildExecutionAnalytics() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Analytics failed');
    }
  });

  app.get('/api/execution-trace', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(100, Number(req.query.limit) || 30);
      res.json({ status: 'success', data: await listTraces(limit) });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'List failed');
    }
  });

  app.get('/api/execution-trace/campaign/:campaignId', async (req: Request, res: Response) => {
    try {
      const trace = await getLatestTraceForCampaign(req.params.campaignId);
      if (!trace) return sendError(res, 404, 'No trace for campaign');
      res.json({
        status: 'success',
        data: {
          trace,
          timelineText: formatTraceTimelineLines(trace).join('\n'),
          summaryText: formatTraceSummaryLines(trace).join('\n'),
        },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Get failed');
    }
  });

  app.get('/api/execution-trace/resolve', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || req.query.campaign || '');
      const trace = await resolveTraceForQuery(q);
      if (!trace) return sendError(res, 404, 'Trace not found');
      res.json({ status: 'success', data: { text: formatTraceSummaryLines(trace).join('\n'), trace } });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Resolve failed');
    }
  });

  app.get('/api/execution-trace/:traceId', async (req: Request, res: Response) => {
    try {
      const trace = await getTrace(req.params.traceId);
      if (!trace) return sendError(res, 404, 'Trace not found');
      res.json({ status: 'success', data: trace });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Get failed');
    }
  });
}
