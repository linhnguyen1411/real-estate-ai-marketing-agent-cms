import type { Request, Response, NextFunction } from 'express';

export function createCorsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin || (req.headers as any).Origin;

    if (!origin || typeof origin !== 'string') {
      return next();
    }

    let rawAllowed = process.env.CORS_ORIGINS;
    if (!rawAllowed) {
      const appUrl = process.env.APP_URL;
      if (appUrl && appUrl !== 'MY_APP_URL' && !appUrl.startsWith('http://localhost') && !appUrl.startsWith('https://')) {
        rawAllowed = 'https://bdsdanang.site';
      } else {
        rawAllowed = appUrl || 'https://bdsdanang.site';
      }
      if (rawAllowed === 'MY_APP_URL') {
        rawAllowed = 'https://bdsdanang.site';
      }
    }
    const allowedOrigins = rawAllowed
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    const isAllowed = allowedOrigins.includes(origin) || allowedOrigins.includes('*');

    if (isAllowed) {
      if (allowedOrigins.includes('*') && (!process.env.APP_URL || process.env.APP_URL === 'MY_APP_URL')) {
        res.header('Access-Control-Allow-Origin', '*');
      } else {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Agent-Token, X-Telegram-Bot-Api-Secret-Token'
      );
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
