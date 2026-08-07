import express, { type Express } from 'express';
import { registerMiddleware, type MiddlewareOptions } from './middleware';

export function createApp(opts: MiddlewareOptions): Express {
  const app = express();
  app.set('trust proxy', true);
  registerMiddleware(app, opts);
  return app;
}
