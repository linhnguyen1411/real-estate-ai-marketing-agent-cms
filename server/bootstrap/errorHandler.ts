import type { ErrorRequestHandler } from 'express';

/** JSON body parse syntax errors → 400 (identical to prior server.ts behavior). */
export const jsonSyntaxErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ status: 'error', message: 'JSON request không hợp lệ.' });
    return;
  }
  next(err);
};
