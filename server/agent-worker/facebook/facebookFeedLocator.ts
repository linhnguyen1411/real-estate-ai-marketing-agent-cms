/**
 * Facebook group feed locator.
 *
 * The group feed is wrapped in `[role="feed"]`. Comments and post-detail dialogs
 * live OUTSIDE this container, so every parser / fingerprint / scroll operation
 * must be scoped to this feed root — never `document.querySelectorAll` at page
 * level.
 */

import type { Locator, Page } from 'playwright';

export const FB_FEED_ROOT_SELECTOR = '[role="feed"]';

export interface LocatedFacebookFeed {
  found: boolean;
  /** Always returned (may resolve to zero elements when `found` is false) */
  locator: Locator;
}

/**
 * Locate the group feed root. Returns a Playwright Locator scoped to
 * `[role="feed"]` and whether it is present + visible.
 */
export async function locateFacebookGroupFeed(page: Page): Promise<LocatedFacebookFeed> {
  const locator = page.locator(FB_FEED_ROOT_SELECTOR).first();
  const count = await locator.count().catch(() => 0);
  if (count === 0) {
    return { found: false, locator };
  }
  const visible = await locator.isVisible().catch(() => false);
  return { found: visible, locator };
}

/**
 * Wait for the feed root to become visible (best-effort). Returns true if it
 * appeared within the timeout.
 */
export async function waitForFacebookGroupFeed(
  page: Page,
  timeoutMs: number,
): Promise<boolean> {
  return page
    .locator(FB_FEED_ROOT_SELECTOR)
    .first()
    .waitFor({ state: 'visible', timeout: Math.max(0, timeoutMs) })
    .then(() => true)
    .catch(() => false);
}

/**
 * Shared browser-context helper source. Injected into `page.evaluate` bodies so
 * the feed root and accepted-post collection logic stay identical across the
 * parser, the fingerprint and the scroll controller.
 *
 * Exposes on the evaluated scope:
 *   __fbFindFeedRoot()      -> Element | null
 *   __fbCollectFeedArticles(feed) -> Element[]  (top-level, non-dialog, non-nested)
 */
export const FB_FEED_RUNTIME_JS = `
  function __fbFindFeedRoot() {
    return document.querySelector('[role="feed"]');
  }
  function __fbIsTopLevelFeedArticle(article) {
    if (!article) return false;
    if (article.closest('[role="dialog"]')) return false;
    var parent = article.parentElement;
    if (parent && parent.closest('[role="article"]')) return false;
    return true;
  }
  function __fbCollectFeedArticles(feed) {
    if (!feed) return [];
    return Array.prototype.slice
      .call(feed.querySelectorAll('[role="article"]'))
      .filter(__fbIsTopLevelFeedArticle);
  }
  function __fbIsLoadingArticle(article) {
    if (!article) return true;
    if (article.querySelector('[data-visualcompletion="loading-state"]')) return true;
    var aria = (article.getAttribute('aria-label') || '').toLowerCase();
    if (aria.indexOf('đang tải') >= 0 || aria.indexOf('loading') >= 0) return true;
    return false;
  }
  function __fbIsCommentArticle(article) {
    if (!article) return false;
    var aria = ((article.getAttribute('aria-label') || '') + ' ' + (article.getAttribute('aria-description') || '')).toLowerCase();
    if (aria.indexOf('bình luận dưới tên') >= 0) return true;
    if (aria.indexOf('phản hồi dưới tên') >= 0) return true;
    if (aria.indexOf('comment by') >= 0 || aria.indexOf('comment on') >= 0) return true;
    return false;
  }
  function __fbCountFeedHydration(feed) {
    if (!feed) return { loading: 0, hydrated: 0, total: 0 };
    var articles = __fbCollectFeedArticles(feed);
    var loading = 0;
    var hydrated = 0;
    for (var i = 0; i < articles.length; i++) {
      if (__fbIsCommentArticle(articles[i])) continue;
      if (__fbIsLoadingArticle(articles[i])) {
        loading++;
        continue;
      }
      var text = (articles[i].innerText || articles[i].textContent || '').replace(/\\s+/g, ' ').trim();
      var hasMsg = !!articles[i].querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"], div[data-ad-rendering-role="story_message"]');
      if (text.length >= 15 || hasMsg) hydrated++;
    }
    return { loading: loading, hydrated: hydrated, total: articles.length };
  }
  function __fbNudgeLoadingArticles(feed) {
    if (!feed) return;
    var articles = __fbCollectFeedArticles(feed);
    for (var i = 0; i < articles.length; i++) {
      if (__fbIsLoadingArticle(articles[i])) {
        try { articles[i].scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
      }
    }
  }
`;

export interface FeedHydrationSnapshot {
  loading: number;
  hydrated: number;
  total: number;
  waitedMs: number;
}

const FEED_HYDRATION_SCRIPT = `(() => {
  ${FB_FEED_RUNTIME_JS}
  var feed = __fbFindFeedRoot();
  return __fbCountFeedHydration(feed);
})()`;

/**
 * Facebook renders feed posts as skeleton placeholders ("Đang tải...") first.
 * Parsing before hydration yields empty contentText. Poll until at least one
 * hydrated post appears or timeout.
 */
export async function waitForFacebookFeedPostsHydrated(
  page: Page,
  options: { timeoutMs?: number; minHydrated?: number; pollMs?: number } = {},
): Promise<FeedHydrationSnapshot> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const minHydrated = options.minHydrated ?? 1;
  const pollMs = options.pollMs ?? 750;
  const start = Date.now();

  const read = async () =>
    page.evaluate(FEED_HYDRATION_SCRIPT) as Promise<{
      loading: number;
      hydrated: number;
      total: number;
    }>;

  let snap = await read();
  let scrollAttempts = 0;
  while (snap.hydrated < minHydrated && Date.now() - start < timeoutMs) {
    await page.evaluate(`(() => {
      ${FB_FEED_RUNTIME_JS}
      var feed = __fbFindFeedRoot();
      __fbNudgeLoadingArticles(feed);
      if (feed) feed.scrollBy(0, Math.max(300, Math.floor(feed.clientHeight * 0.6)));
      else window.scrollBy(0, 500);
    })()`);
    scrollAttempts += 1;
    await page.waitForTimeout(pollMs);
    snap = await read();
  }

  return { ...snap, waitedMs: Date.now() - start };
}
