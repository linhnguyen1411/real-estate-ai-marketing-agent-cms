/**
 * Marketing Organization style API for AI Gateway admin + status.
 */

import type { Express, Request, Response } from 'express';
import {
  formatAiStatusBriefing,
  gatewayChat,
  getGatewayHealth,
  listGatewayProviders,
} from '../gateway';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerAiGatewayRoutes(app: Express): void {
  app.get('/api/ai-gateway/health', async (_req: Request, res: Response) => {
    try {
      const data = await getGatewayHealth();
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Health failed');
    }
  });

  app.get('/api/ai-gateway/status', async (_req: Request, res: Response) => {
    try {
      const health = await getGatewayHealth();
      res.json({
        status: 'success',
        data: {
          text: formatAiStatusBriefing(health),
          providers: health,
        },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Status failed');
    }
  });

  app.get('/api/ai-gateway/providers', async (_req: Request, res: Response) => {
    try {
      const health = await getGatewayHealth();
      const data = listGatewayProviders().map(p => {
        const h = health.find(x => x.id === p.id)!;
        return {
          ...h,
          priority: p.priority,
          cost: p.cost(),
        };
      });
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Providers failed');
    }
  });

  app.post('/api/ai-gateway/chat', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const prompt = String(body.prompt || body.message || '').trim();
      if (!prompt) return sendError(res, 400, 'prompt is required');
      const system = String(body.system || 'You are a helpful assistant.');
      const result = await gatewayChat(system, prompt, {
        temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
        preferredProviders: Array.isArray(body.preferredProviders)
          ? (body.preferredProviders as Array<'gemini' | 'kira' | 'local' | 'openai' | 'ollama'>)
          : undefined,
      });
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Chat failed');
    }
  });
}
