/**
 * Facebook DOM selectors — centralized, defensive.
 * NOTE: Facebook UI changes frequently. Selectors marked @calibrate may need adjustment
 * in a live logged-in session. Prefer role/aria/text over hashed class names.
 */

export const FB_URL_PATTERNS = {
  login: /\/login(\.php)?/i,
  checkpoint: /checkpoint|accountquality/i,
  captcha: /captcha|recaptcha/i,
  challenge: /two_step_verification|two.factor|challenge/i,
  group: /facebook\.com\/groups\//i,
} as const;

/** @calibrate Login wall indicators */
export const FB_LOGIN_SELECTORS = [
  'input[name="email"]',
  'input[name="pass"]',
  '#loginform',
  '[data-testid="royal_login_form"]',
] as const;

/** @calibrate Checkpoint / identity verification copy */
export const FB_CHECKPOINT_TEXT = [
  'checkpoint',
  'xác minh danh tính',
  'xác nhận danh tính',
  'confirm your identity',
  'security check',
  'two-factor',
  'two factor',
] as const;

export const FB_CAPTCHA_TEXT = [
  'captcha',
  'recaptcha',
  'prove you',
  'không phải robot',
] as const;

/** Feed post containers — role=article is primary strategy */
export const FB_POST_ROOT = '[role="article"]';

/**
 * Group feed wrapper. Facebook renders the group feed inside `[role="feed"]`.
 * Comments and post-detail dialogs live OUTSIDE this container, so scoping to it
 * is the primary defense against parsing comments as posts.
 */
export const FB_FEED_CONTAINER = '[role="feed"]';

/** Post-detail modal / lightbox wrapper */
export const FB_DIALOG = '[role="dialog"]';

/** Close button inside a Facebook dialog (VN + EN) */
export const FB_DIALOG_CLOSE_SELECTOR =
  '[role="dialog"] [aria-label="Close"], [role="dialog"] [aria-label="Đóng"], [role="dialog"] [aria-label="close" i]';

/** @calibrate Feed tab labels (Vietnamese + English) */
export const FB_FEED_TAB_LABELS: Record<string, RegExp> = {
  discussion: /thảo luận|discussion|bài viết/i,
  new: /mới nhất|new posts|mới/i,
  featured: /nổi bật|featured/i,
};

/** See more / expand post text */
export const FB_SEE_MORE_PATTERN = /xem thêm|see more|xem thể/i;

/** Permalink anchors inside a post */
export const FB_PERMALINK_SELECTOR = 'a[href*="/posts/"], a[href*="permalink"], a[href*="story_fbid"]';

/** Author link heuristic */
export const FB_AUTHOR_LINK_SELECTOR = 'a[href*="/user/"], a[href*="/profile.php"], h2 a[role="link"], strong a[role="link"]';

/** Post body text containers — fallback chain @calibrate */
export const FB_POST_BODY_SELECTORS = [
  '[data-ad-preview="message"]',
  '[data-ad-comet-preview="message"]',
  'div[dir="auto"]',
] as const;

/** Time / published label */
export const FB_TIME_SELECTORS = [
  'a[href*="/posts/"] abbr',
  'a[aria-label*=":"]',
  'span[id*="jsc"]',
  'abbr',
] as const;

/** Basic engagement metrics @calibrate */
export const FB_METRIC_PATTERN = /(\d+[\d.,]*)\s*(lượt thích|likes?|bình luận|comments?|chia sẻ|shares?)/gi;

export function isFacebookHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'fb.com' ||
    host.endsWith('.fb.com')
  );
}

export function isFacebookGroupUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isFacebookHost(parsed.hostname) && parsed.pathname.includes('/groups/');
  } catch {
    return false;
  }
}

/**
 * Home / personal news feed (facebook.com), not a group.
 * Accepts bare domain, `/`, `/home`, `/home.php`.
 */
export function isFacebookHomeFeedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!isFacebookHost(parsed.hostname)) return false;
    if (parsed.pathname.includes('/groups/')) return false;
    const path = (parsed.pathname || '/').replace(/\/+$/, '') || '/';
    return path === '/' || path === '/home' || path === '/home.php';
  } catch {
    return false;
  }
}

/** URLs the Facebook reader can scan: group feed or personal home feed. */
export function isFacebookScannableUrl(url: string): boolean {
  return isFacebookGroupUrl(url) || isFacebookHomeFeedUrl(url);
}

/** True when current/source URL is a scannable Facebook feed context. */
export function isFacebookFeedContextUrl(url: string): boolean {
  return isFacebookScannableUrl(url);
}

export function normalizeFacebookSourceUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.search = '';
  const path = (parsed.pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/home' || path === '/home.php') {
    parsed.pathname = '/';
    return `${parsed.protocol}//${parsed.host}`;
  }
  parsed.pathname = path;
  return parsed.toString().replace(/\/+$/, '');
}

/** @deprecated use normalizeFacebookSourceUrl */
export function normalizeGroupUrl(url: string): string {
  return normalizeFacebookSourceUrl(url);
}
