/**
 * Runtime Agent HTTP API — Execution Agents talk only through these endpoints.
 * Auth: Bearer AGENT_RUNTIME_TOKEN (or X-Agent-Token).
 */

import type { Express, Request, Response, NextFunction } from 'express';
import {
  runtimeAgentClaimJob,
  runtimeAgentCompleteJob,
  runtimeAgentHeartbeat,
  runtimeAgentOffline,
  runtimeAgentReclaim,
  runtimeAgentRegister,
  runtimeAgentReleaseJob,
  runtimeAgentRequeueJob,
} from './runtimeAgentService';

function runtimeToken(): string {
  return (
    process.env.AGENT_RUNTIME_TOKEN?.trim() ||
    process.env.AGENT_WORKER_TOKEN?.trim() ||
    'dev-runtime-token'
  );
}

function requireAgentToken(req: Request, res: Response, next: NextFunction): void {
  const header = String(req.headers.authorization || '');
  const bearer = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : '';
  const alt = String(req.headers['x-agent-token'] || '').trim();
  const token = bearer || alt;
  if (!token || token !== runtimeToken()) {
    res.status(401).json({ status: 'error', message: 'Unauthorized Execution Agent.' });
    return;
  }
  next();
}

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerRuntimeAgentRoutes(app: Express): void {
  const base = '/api/agent/runtime';

  app.post(`${base}/register`, requireAgentToken, async (req: Request, res: Response) => {
    try {
      const data = await runtimeAgentRegister({
        agentId: String(req.body?.agentId || '').trim(),
        hostname: req.body?.hostname ? String(req.body.hostname) : undefined,
        version: req.body?.version ? String(req.body.version) : undefined,
        capabilities: Array.isArray(req.body?.capabilities)
          ? req.body.capabilities.map(String)
          : undefined,
        companyId: req.body?.companyId ?? null,
        metadata:
          req.body?.metadata && typeof req.body.metadata === 'object'
            ? req.body.metadata
            : undefined,
        profilePath: req.body?.profilePath ? String(req.body.profilePath) : undefined,
        sessionName: req.body?.sessionName ? String(req.body.sessionName) : undefined,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Register failed');
    }
  });

  app.post(`${base}/heartbeat`, requireAgentToken, async (req: Request, res: Response) => {
    try {
      const data = await runtimeAgentHeartbeat({
        agentId: String(req.body?.agentId || '').trim(),
        sessionId: req.body?.sessionId ? String(req.body.sessionId) : undefined,
        status: req.body?.status ? String(req.body.status) : undefined,
        currentUrl: req.body?.currentUrl ?? undefined,
        metadata:
          req.body?.metadata && typeof req.body.metadata === 'object'
            ? req.body.metadata
            : undefined,
        lastError: req.body?.lastError ?? undefined,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Heartbeat failed');
    }
  });

  app.post(`${base}/offline`, requireAgentToken, async (req: Request, res: Response) => {
    try {
      const data = await runtimeAgentOffline({
        agentId: String(req.body?.agentId || '').trim(),
        lastError: req.body?.lastError ? String(req.body.lastError) : undefined,
        requeueJobs: req.body?.requeueJobs !== false,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Offline failed');
    }
  });

  app.post(`${base}/jobs/claim`, requireAgentToken, async (req: Request, res: Response) => {
    try {
      const data = await runtimeAgentClaimJob({
        agentId: String(req.body?.agentId || '').trim(),
        capabilities: Array.isArray(req.body?.capabilities)
          ? req.body.capabilities.map(String)
          : undefined,
        preferTypes: Array.isArray(req.body?.preferTypes)
          ? req.body.preferTypes.map(String)
          : undefined,
        excludeTypes: Array.isArray(req.body?.excludeTypes)
          ? req.body.excludeTypes.map(String)
          : undefined,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Claim failed');
    }
  });

  app.post(`${base}/jobs/:id/complete`, requireAgentToken, async (req: Request, res: Response) => {
    try {
      const result =
        req.body?.result && typeof req.body.result === 'object' ? req.body.result : {};
      const data = await runtimeAgentCompleteJob(req.params.id, result);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Complete failed');
    }
  });

  app.post(`${base}/jobs/:id/release`, requireAgentToken, async (req: Request, res: Response) => {
    try {
      const errorMessage = String(req.body?.errorMessage || req.body?.error || 'released');
      const data = await runtimeAgentReleaseJob(req.params.id, errorMessage);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Release failed');
    }
  });

  app.post(`${base}/jobs/:id/requeue`, requireAgentToken, async (req: Request, res: Response) => {
    try {
      const reason = String(req.body?.reason || 'requeued');
      const data = await runtimeAgentRequeueJob(req.params.id, reason);
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Requeue failed');
    }
  });

  app.post(`${base}/jobs/reclaim`, requireAgentToken, async (req: Request, res: Response) => {
    try {
      const data = await runtimeAgentReclaim({
        agentId: String(req.body?.agentId || '').trim(),
        staleMs: req.body?.staleMs ? Number(req.body.staleMs) : undefined,
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : 'Reclaim failed');
    }
  });
}
