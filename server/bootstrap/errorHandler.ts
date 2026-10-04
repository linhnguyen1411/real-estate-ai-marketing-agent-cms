import type { ErrorRequestHandler } from 'express';

/** JSON body parse syntax errors → 400 (identical to prior server.ts behavior). */
export const jsonSyntaxErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ status: 'error', message: 'JSON request không hợp lệ.' });
    return;
  }
  next(err);
};

export const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  
  if (isProduction) {
    res.status(status).json({
      status: 'error',
      message: status === 500 ? 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng thử lại sau.' : (err?.message || 'Yêu cầu không hợp lệ.'),
    });
  } else {
    res.status(status).json({
      status: 'error',
      message: err?.message || 'Đã xảy ra lỗi máy chủ nội bộ.',
      stack: err?.stack,
    });
  }
};
