import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

interface LockoutEntry {
  failures: number;
  lockedUntil?: number;
  lastFailureTime: number;
}

const emailLockoutMap = new Map<string, LockoutEntry>();

export function recordFailedLogin(email: string): { isLocked: boolean; remainingSec: number } {
  if (!email) return { isLocked: false, remainingSec: 0 };
  const normEmail = email.trim().toLowerCase();
  const now = Date.now();
  const entry = emailLockoutMap.get(normEmail) || { failures: 0, lastFailureTime: now };

  // Reset counter if last failure was over 2 hours ago
  if (now - entry.lastFailureTime > 2 * 60 * 60 * 1000) {
    entry.failures = 0;
    delete entry.lockedUntil;
  }

  entry.failures += 1;
  entry.lastFailureTime = now;

  let lockoutMs = 0;
  if (entry.failures >= 10) {
    lockoutMs = 60 * 60 * 1000; // 60 minutes
  } else if (entry.failures >= 7) {
    lockoutMs = 30 * 60 * 1000; // 30 minutes
  } else if (entry.failures >= 5) {
    lockoutMs = 15 * 60 * 1000; // 15 minutes
  }

  if (lockoutMs > 0) {
    entry.lockedUntil = now + lockoutMs;
  }
  emailLockoutMap.set(normEmail, entry);

  return {
    isLocked: Boolean(entry.lockedUntil && entry.lockedUntil > now),
    remainingSec: entry.lockedUntil ? Math.ceil((entry.lockedUntil - now) / 1000) : 0,
  };
}

export function isEmailLocked(email: string): { isLocked: boolean; remainingSec: number } {
  if (!email) return { isLocked: false, remainingSec: 0 };
  const normEmail = email.trim().toLowerCase();
  const entry = emailLockoutMap.get(normEmail);
  if (!entry || !entry.lockedUntil) return { isLocked: false, remainingSec: 0 };
  const now = Date.now();
  if (now < entry.lockedUntil) {
    return { isLocked: true, remainingSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  return { isLocked: false, remainingSec: 0 };
}

export function clearLoginFailures(email: string): void {
  if (email) {
    emailLockoutMap.delete(email.trim().toLowerCase());
  }
}

/**
 * Middleware checking if the targeted email account is currently locked due to progressive failure.
 */
export function loginEmailLockoutGuard(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const status = isEmailLocked(email);
  if (status.isLocked) {
    const minutes = Math.max(1, Math.ceil(status.remainingSec / 60));
    res.status(429).json({
      status: 'error',
      message: `Tài khoản tạm thời bị khóa do thử đăng nhập quá nhiều lần không thành công. Vui lòng thử lại sau ${minutes} phút.`,
    });
    return;
  }
  next();
}

// 1a. Auth login rate limit by IP (10 attempts per 15 minutes per IP in production)
export const loginIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.socket.remoteAddress || '';
      return ip.includes('127.0.0.1') || ip.includes('::1') || ip === 'localhost';
    }
    return false;
  },
  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message: 'Địa chỉ mạng của bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    });
  },
});

// 1b. Combined login limiter for router mounting
export const loginRateLimiter = [loginIpRateLimiter, loginEmailLockoutGuard];

// 2. Public API general rate limit: 120 requests per minute per IP
export const publicApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message: 'Quá nhiều yêu cầu từ địa chỉ mạng của bạn. Vui lòng thử lại sau.',
    });
  },
});

// 3. Public Chat send rate limit: 30 requests per minute per IP (AI generation protection)
export const publicChatSendRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi trong giây lát.',
    });
  },
});

// Alias for backwards compatibility
export const publicChatRateLimiter = publicChatSendRateLimiter;

// 3b. Public Chat history poll rate limit: 120 requests per minute per IP
export const publicChatHistoryRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message: 'Yêu cầu tải lịch sử chat vượt quá giới hạn. Vui lòng đợi giây lát.',
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

// 5. Auth register rate limit: 10 registrations per 15 minutes per IP
export const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      status: 'error',
      message: 'Quá nhiều yêu cầu đăng ký từ địa chỉ mạng của bạn. Vui lòng thử lại sau 15 phút.',
    });
  },
});
