import type { Page } from 'playwright';
import {
  FB_CAPTCHA_TEXT,
  FB_CHECKPOINT_TEXT,
  FB_LOGIN_SELECTORS,
  FB_URL_PATTERNS,
} from './facebookSelectors';

export type FacebookAuthBlockKind = 'login' | 'checkpoint' | 'captcha' | null;

export interface FacebookAuthState {
  blocked: boolean;
  kind: FacebookAuthBlockKind;
  reason: string;
  currentUrl: string;
}

export async function detectFacebookAuthBlock(page: Page): Promise<FacebookAuthState> {
  const currentUrl = page.url();
  const urlKind = detectAuthKindFromUrl(currentUrl);
  if (urlKind) {
    return {
      blocked: true,
      kind: urlKind,
      reason: `URL indicates ${urlKind}: ${currentUrl}`,
      currentUrl,
    };
  }

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const lower = bodyText.toLowerCase();

  if (FB_CAPTCHA_TEXT.some(token => lower.includes(token))) {
    return {
      blocked: true,
      kind: 'captcha',
      reason: 'Trang có dấu hiệu CAPTCHA — cần xử lý thủ công.',
      currentUrl,
    };
  }

  if (FB_CHECKPOINT_TEXT.some(token => lower.includes(token))) {
    return {
      blocked: true,
      kind: 'checkpoint',
      reason: 'Facebook checkpoint / xác minh danh tính — dừng job.',
      currentUrl,
    };
  }

  for (const selector of FB_LOGIN_SELECTORS) {
    const visible = await page.locator(selector).first().isVisible().catch(() => false);
    if (visible && (lower.includes('log in') || lower.includes('đăng nhập'))) {
      return {
        blocked: true,
        kind: 'login',
        reason: 'Chưa đăng nhập hoặc phiên hết hạn — chạy npm run agent:login.',
        currentUrl,
      };
    }
  }

  return { blocked: false, kind: null, reason: '', currentUrl };
}

function detectAuthKindFromUrl(url: string): FacebookAuthBlockKind {
  if (FB_URL_PATTERNS.captcha.test(url)) return 'captcha';
  if (FB_URL_PATTERNS.checkpoint.test(url)) return 'checkpoint';
  if (FB_URL_PATTERNS.login.test(url)) return 'login';
  return null;
}

export class FacebookAuthBlockedError extends Error {
  readonly kind: FacebookAuthBlockKind;

  constructor(kind: FacebookAuthBlockKind, message: string) {
    super(message);
    this.name = 'FacebookAuthBlockedError';
    this.kind = kind;
  }
}
