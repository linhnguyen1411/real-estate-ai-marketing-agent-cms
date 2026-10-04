import rateLimit from 'express-rate-limit';

// 1. Auth login rate limit: 5 requests per 15 minutes by IP + email key generator
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    keyGeneratorIpFallback: false,
  },
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `${ip}:${email}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    });
  },
});

// 2. Public API general rate limit: 30 requests per minute per IP
export const publicApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message: 'Quá nhiều yêu cầu từ địa chỉ mạng của bạn. Vui lòng thử lại sau.',
    });
  },
});

// 3. Public Chat rate limit: 10 requests per minute per IP
export const publicChatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi trong giây lát.',
    });
  },
});

// 4. Ingest and Webhooks rate limit: 120 requests per minute per IP
export const ingestWebhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message: 'Webhook rate limit exceeded.',
    });
  },
});
