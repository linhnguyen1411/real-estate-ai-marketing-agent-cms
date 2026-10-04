import express, { type Express } from 'express';
import { registerMiddleware, type MiddlewareOptions } from './middleware';

export function createApp(opts: MiddlewareOptions): Express {
  const app = express();
  const hops = parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
  app.set('trust proxy', isNaN(hops) || hops <= 0 ? false : hops);
  registerMiddleware(app, opts);
  return app;
}
