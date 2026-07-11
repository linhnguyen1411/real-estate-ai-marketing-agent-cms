import type { Page } from 'playwright';
import {
  FB_CAPTCHA_TEXT,
  FB_CHECKPOINT_TEXT,
  FB_LOGIN_SELECTORS,
  FB_URL_PATTERNS,
} from './facebookSelectors';

export type FacebookAuthBlockKind = 'login' | 'checkpoint' | 'captcha' | 'challenge' | null;

export type FacebookSessionDetectedState =
  | 'logged_in'
  | 'login_required'
  | 'checkpoint'
  | 'challenge'
  | 'unknown';

export type FacebookSessionErrorCode =
  | 'FACEBOOK_LOGIN_REQUIRED'
  | 'FACEBOOK_CHECKPOINT'
  | 'FACEBOOK_CHALLENGE'
  | 'FACEBOOK_SESSION_UNKNOWN';

export interface FacebookAuthState {
  blocked: boolean;
  kind: FacebookAuthBlockKind;
  reason: string;
  currentUrl: string;
  errorCode?: FacebookSessionErrorCode;
}

export interface FacebookSessionProbeResult {
  loggedIn: boolean;
  currentUrl: string;
  title: string;
  detectedState: FacebookSessionDetectedState;
  errorCode?: FacebookSessionErrorCode;
}

export async function detectFacebookAuthBlock(page: Page): Promise<FacebookAuthState> {
  const currentUrl = page.url();
  const urlKind = detectAuthKindFromUrl(currentUrl);
  if (urlKind) {
    return {
      blocked: true,
      kind: urlKind,
      reason: `URL indicates ${urlKind}`,
      currentUrl,
      errorCode: kindToErrorCode(urlKind),
    };
  }

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const lower = bodyText.toLowerCase();

  if (FB_CAPTCHA_TEXT.some(token => lower.includes(token))) {
    return {
      blocked: true,
      kind: 'captcha',
      reason: 'CAPTCHA / security check detected — manual action required.',
      currentUrl,
      errorCode: 'FACEBOOK_CHALLENGE',
    };
  }

  if (
    /two.step|two_factor|security check|xác minh|challenge/i.test(lower) ||
    FB_CHECKPOINT_TEXT.some(token => lower.includes(token))
  ) {
    const isChallenge = /two.step|two_factor|challenge|security check/i.test(lower);
    const kind: FacebookAuthBlockKind = isChallenge ? 'challenge' : 'checkpoint';
    return {
      blocked: true,
      kind,
      reason: isChallenge
        ? 'Facebook challenge / 2FA / security check — stop job.'
        : 'Facebook checkpoint — stop job.',
      currentUrl,
      errorCode: kindToErrorCode(kind),
    };
  }

  for (const selector of FB_LOGIN_SELECTORS) {
    const visible = await page.locator(selector).first().isVisible().catch(() => false);
    if (visible) {
      return {
        blocked: true,
        kind: 'login',
        reason: 'Login form visible — run CDP Chrome login or agent:login (managed).',
        currentUrl,
        errorCode: 'FACEBOOK_LOGIN_REQUIRED',
      };
    }
  }

  return { blocked: false, kind: null, reason: '', currentUrl };
}

/** Probe for scripts — never treats unknown as logged_in. */
export async function probeFacebookSessionState(page: Page): Promise<FacebookSessionProbeResult> {
  const title = await page.title().catch(() => '');
  const auth = await detectFacebookAuthBlock(page);
  const currentUrl = auth.currentUrl || page.url();

  if (auth.blocked) {
    if (auth.kind === 'challenge' || auth.kind === 'captcha') {
      return {
        loggedIn: false,
        currentUrl,
        title,
        detectedState: 'challenge',
        errorCode: auth.errorCode ?? 'FACEBOOK_CHALLENGE',
      };
    }
    if (auth.kind === 'checkpoint') {
      return {
        loggedIn: false,
        currentUrl,
        title,
        detectedState: 'checkpoint',
        errorCode: 'FACEBOOK_CHECKPOINT',
      };
    }
    if (auth.kind === 'login') {
      return {
        loggedIn: false,
        currentUrl,
        title,
        detectedState: 'login_required',
        errorCode: 'FACEBOOK_LOGIN_REQUIRED',
      };
    }
  }

  const markers = [
    '[aria-label="Your profile"]',
    '[aria-label="Trang cá nhân của bạn"]',
    '[aria-label="Account"]',
    '[aria-label="Tài khoản"]',
    'div[role="navigation"]',
    '[aria-label="Facebook"]',
  ];
  let markerVisible = false;
  for (const sel of markers) {
    if (await page.locator(sel).first().isVisible().catch(() => false)) {
      markerVisible = true;
      break;
    }
  }

  // Cookie presence is a weak signal only when combined with UI — never log cookie values.
  const cookies = await page.context().cookies('https://www.facebook.com').catch(() => []);
  const hasUserCookie = cookies.some(c => c.name === 'c_user' && Boolean(c.value));

  if (markerVisible && hasUserCookie) {
    return { loggedIn: true, currentUrl, title, detectedState: 'logged_in' };
  }
  if (markerVisible && !/login|checkpoint|challenge/i.test(currentUrl)) {
    return { loggedIn: true, currentUrl, title, detectedState: 'logged_in' };
  }

  return {
    loggedIn: false,
    currentUrl,
    title,
    detectedState: 'unknown',
    errorCode: 'FACEBOOK_SESSION_UNKNOWN',
  };
}

function detectAuthKindFromUrl(url: string): FacebookAuthBlockKind {
  if (FB_URL_PATTERNS.captcha.test(url)) return 'captcha';
  if (/two_step_verification|two.factor|challenge/i.test(url)) return 'challenge';
  if (FB_URL_PATTERNS.checkpoint.test(url)) {
    // checkpoint pattern also matches two_step — already handled above
    if (/two_step/i.test(url)) return 'challenge';
    return 'checkpoint';
  }
  if (FB_URL_PATTERNS.login.test(url)) return 'login';
  return null;
}

function kindToErrorCode(kind: FacebookAuthBlockKind): FacebookSessionErrorCode | undefined {
  if (kind === 'login') return 'FACEBOOK_LOGIN_REQUIRED';
  if (kind === 'checkpoint') return 'FACEBOOK_CHECKPOINT';
  if (kind === 'challenge' || kind === 'captcha') return 'FACEBOOK_CHALLENGE';
  return undefined;
}

export class FacebookAuthBlockedError extends Error {
  readonly kind: FacebookAuthBlockKind;
  readonly errorCode: FacebookSessionErrorCode;

  constructor(
    kind: FacebookAuthBlockKind,
    message: string,
    errorCode?: FacebookSessionErrorCode,
  ) {
    super(message);
    this.name = 'FacebookAuthBlockedError';
    this.kind = kind;
    this.errorCode = errorCode ?? kindToErrorCode(kind) ?? 'FACEBOOK_SESSION_UNKNOWN';
  }
}

export function isNonRetryableBrowserErrorMessage(message: string): boolean {
  return /FACEBOOK_LOGIN_REQUIRED|FACEBOOK_CHECKPOINT|FACEBOOK_CHALLENGE|FACEBOOK_SESSION_UNKNOWN|CDP_UNREACHABLE|CDP_NO_CONTEXT|BROWSER_PROFILE_LOCKED/.test(
    message,
  );
}
