/**
 * HTTP routes for Telegram Control Plane (webhook + status).
 */

import type { Express, Request, Response } from 'express';
import {
  getTelegramConsoleStatus,
  handleTelegramWebhookUpdate,
  startTelegramControlPlane,
  stopTelegramControlPlane,
} from './lifecycle';

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

export function registerTelegramControlPlaneRoutes(app: Express): void {
  app.get('/api/agent/telegram/console/status', (_req: Request, res: Response) => {
    res.json({ status: 'success', data: getTelegramConsoleStatus() });
  });

  app.post('/api/agent/telegram/console/start', async (_req: Request, res: Response) => {
    try {
      const data = await startTelegramControlPlane();
      res.json({ status: 'success', data });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Start failed');
    }
  });

  app.post('/api/agent/telegram/console/stop', async (_req: Request, res: Response) => {
    try {
      await stopTelegramControlPlane();
      res.json({ status: 'success', data: getTelegramConsoleStatus() });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Stop failed');
    }
  });

  /**
   * Telegram Bot webhook ingress.
   * Optional secret: ?secret= or header X-Telegram-Bot-Api-Secret-Token
   */
  app.post('/api/webhooks/telegram', async (req: Request, res: Response) => {
    try {
      const secret =
        (typeof req.query.secret === 'string' && req.query.secret) ||
        (typeof req.headers['x-telegram-bot-api-secret-token'] === 'string'
          ? req.headers['x-telegram-bot-api-secret-token']
          : null);
      const result = await handleTelegramWebhookUpdate(req.body, secret);
      if (!result.ok && result.reason === 'invalid_secret') {
        sendError(res, 401, 'Invalid webhook secret');
        return;
      }
      // Always 200 to Telegram when payload accepted/processed path reached
      res.json({ status: 'success', data: result });
    } catch (error: unknown) {
      console.error('[telegram-console] webhook error', error);
      res.status(200).json({ status: 'error', message: 'handled_with_error' });
    }
  });
}
