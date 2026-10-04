import type { Express, Request, Response, NextFunction } from 'express';
import compression from 'compression';
import express from 'express';
import path from 'path';
import helmet from 'helmet';
import { cacheControlMiddleware, createPublicStaticOptions } from '../middleware/staticAssets';
import { registerFacebookWebhookRoutes } from '../facebookRoutes';
import { jsonSyntaxErrorHandler, globalErrorHandler } from './errorHandler';
import { createCorsMiddleware } from '../middleware/cors';
import { httpLogger } from '../middleware/logger';

export type MiddlewareOptions = {
  facebookGraphLegacyEnabled: boolean;
};

export function registerMiddleware(app: Express, opts: MiddlewareOptions): void {
  const { facebookGraphLegacyEnabled: FACEBOOK_GRAPH_LEGACY_ENABLED } = opts;

  // 1. Disable x-powered-by
  app.disable('x-powered-by');

  // 2. Helmet security headers (CSP compatible with SPA + SSR, public cross-origin images)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
          connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
          frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.google.com'],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // 3. CORS allowlist middleware
  app.use(createCorsMiddleware());

  // 4. Compression
  app.use(compression({ level: 6 }));
  app.use(cacheControlMiddleware);

  // 5. Default 1mb JSON body limit (dedicated route limits apply locally)
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        const url = req.url || '';
        if (url.startsWith('/webhooks/facebook') || url.startsWith('/api/agent-ingest/')) {
          (req as Request & { rawBody?: Buffer }).rawBody = buf;
        }
      },
    })
  );

  // 6. Structured Pino HTTP request logging
  app.use(httpLogger);

  if (FACEBOOK_GRAPH_LEGACY_ENABLED) {
    registerFacebookWebhookRoutes(app);
  } else {
    console.warn('[facebook] Graph webhook routes disabled (FACEBOOK_GRAPH_LEGACY_ENABLED=false)');
  }

  const publicAssetsPath = path.join(process.cwd(), 'public');
  app.get('/favicon.ico', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicAssetsPath, 'logo_hl.png'));
  });
  app.use(express.static(publicAssetsPath, createPublicStaticOptions()));

  app.use(jsonSyntaxErrorHandler);
}
