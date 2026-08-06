import type { Express, Request, Response, NextFunction } from 'express';
import compression from 'compression';
import express from 'express';
import path from 'path';
import { cacheControlMiddleware, createPublicStaticOptions } from '../middleware/staticAssets';
import { registerFacebookWebhookRoutes } from '../facebookRoutes';
import { jsonSyntaxErrorHandler } from './errorHandler';

export type MiddlewareOptions = {
  facebookGraphLegacyEnabled: boolean;
};

export function registerMiddleware(app: Express, opts: MiddlewareOptions): void {
  const { facebookGraphLegacyEnabled: FACEBOOK_GRAPH_LEGACY_ENABLED } = opts;

  app.use(compression({ level: 6 }));
  app.use(cacheControlMiddleware);

  app.use(express.json({
    limit: process.env.JSON_BODY_LIMIT || '25mb',
    verify: (req, _res, buf) => {
      const url = req.url || '';
      if (url.startsWith('/webhooks/facebook') || url.startsWith('/api/agent-ingest/')) {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      }
    },
  }));

  if (FACEBOOK_GRAPH_LEGACY_ENABLED) {
    registerFacebookWebhookRoutes(app);
  } else {
    console.warn('[facebook] Graph webhook routes disabled (FACEBOOK_GRAPH_LEGACY_ENABLED=false)');
  }

  const publicAssetsPath = path.join(process.cwd(), 'public');
  app.get('/favicon.ico', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicAssetsPath, 'logo.jpg'));
  });
  app.use(express.static(publicAssetsPath, createPublicStaticOptions()));

  app.use(jsonSyntaxErrorHandler);

  // Log API requests
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[API REQUEST] ${req.method} ${req.url}`);
    next();
  });
}
