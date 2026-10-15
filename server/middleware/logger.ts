import pino from 'pino';
import pinoHttp from 'pino-http';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-agent-token"]',
      'req.headers["x-telegram-bot-api-secret-token"]',
      'req.headers["x-hub-signature-256"]',
      '*.password',
      '*.password_hash',
      '*.current_password',
      '*.new_password',
      '*.*password*',
      '*.*token*',
      '*.*secret*',
      'req.query.secret',
      'req.query.token',
    ],
    remove: true,
  },
});

export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => {
      const url = req.url || '';
      return (
        url.startsWith('/favicon.ico') ||
        url.startsWith('/assets/') ||
        url.startsWith('/robots.txt')
      );
    },
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => {
      const rawUrl = req.url || '';
      const cleanUrl = rawUrl.split('?')[0];
      return {
        id: req.id,
        method: req.method,
        url: cleanUrl,
        path: (req as any).path || cleanUrl,
      };
    },
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});
