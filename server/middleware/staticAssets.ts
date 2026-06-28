import type { Request, Response, NextFunction } from 'express';
import path from 'path';

const HASHED_ASSET = /^\/assets\/[^/]+-[a-zA-Z0-9_-]+\.(js|css)$/i;

export function cacheControlMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestPath = req.path || '';
  if (HASHED_ASSET.test(requestPath)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (/\.(jpg|jpeg|png|webp|avif|gif|svg|ico)$/i.test(requestPath)) {
    res.setHeader('Cache-Control', 'public, max-age=2592000');
  } else if (requestPath === '/index.html' || (!requestPath.includes('.') && !requestPath.startsWith('/api'))) {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
}

export function createDistStaticOptions() {
  const distPath = path.join(process.cwd(), 'dist');
  return {
    root: distPath,
    setHeaders: (res: Response, filePath: string) => {
      const relative = filePath.replace(distPath, '').replace(/\\/g, '/');
      if (relative === '/index.html') {
        res.setHeader('Cache-Control', 'no-cache');
        return;
      }
      if (HASHED_ASSET.test(relative)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      if (/\.(jpg|jpeg|png|webp|avif|gif|svg|ico)$/i.test(relative)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
      }
    },
  };
}

export function createPublicStaticOptions() {
  const publicPath = path.join(process.cwd(), 'public');
  return {
    root: publicPath,
    setHeaders: (res: Response, filePath: string) => {
      const relative = filePath.replace(publicPath, '').replace(/\\/g, '/');
      if (/\.(jpg|jpeg|png|webp|avif|gif|svg|ico)$/i.test(relative)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
      }
    },
  };
}
