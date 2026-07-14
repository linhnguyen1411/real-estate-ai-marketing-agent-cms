import type { Locator, Page } from 'playwright';

export type FacebookScrollStopReason =
  | 'max_scrolls'
  | 'max_duration'
  | 'known_post_streak'
  | 'consecutive_empty_passes'
  | 'max_posts'
  | 'manual';

const WRONG_SCROLL_TARGET_ERROR_CODE = 'FACEBOOK_WRONG_SCROLL_TARGET';
const WRONG_SCROLL_TARGET_STOP_REASON = 'wrong_scroll_target';

export interface FacebookScrollConfig {
  maxScrolls: number;
  scrollPauseMs: number;
  maxDurationSeconds: number;
  loadWaitMs?: number;
}

export interface FacebookScrollState {
  scrollsPerformed: number;
  stoppedReason: FacebookScrollStopReason;
  feedChanged?: boolean;
}

export interface FeedFingerprint {
  articleCount: number;
  externalIds: string[];
  canonicalUrls: string[];
  lastFingerprint: string;
}

const FEED_FINGERPRINT_SCRIPT = `
(() => {
  // Scope to the group feed and count only top-level posts (never comments or
  // dialog articles), so the fingerprint reflects feed progress — not comments
  // loading inside an accidental modal.
  const feed = document.querySelector('[role="feed"]');
  const articles = feed
    ? Array.from(feed.querySelectorAll('[role="article"]')).filter(article => {
        if (article.closest('[role="dialog"]')) return false;
        const parent = article.parentElement;
        if (parent && parent.closest('[role="article"]')) return false;
        return true;
      })
    : [];
  const externalIds = [];
  const canonicalUrls = [];
  let lastText = '';

  function extractPermalink(article) {
    const links = article.querySelectorAll('a[href*="/posts/"], a[href*="permalink"], a[href*="story_fbid"]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (!href) continue;
      return href.startsWith('http') ? href : 'https://www.facebook.com' + href;
    }
    return '';
  }

  function extractExternalId(url) {
    if (!url) return null;
    const postMatch = url.match(/\\/posts\\/(\\d+)/);
    if (postMatch) return postMatch[1];
    const fbid = url.match(/story_fbid=(\\d+)/);
    if (fbid) return fbid[1];
    const pfbid = url.match(/(pfbid\\w+)/);
    if (pfbid) return pfbid[1];
    return null;
  }

  for (const article of articles) {
    const permalink = extractPermalink(article);
    const id = extractExternalId(permalink);
    if (id) externalIds.push(id);
    if (permalink) canonicalUrls.push(permalink.split('?')[0]);
    lastText = ((article.innerText || article.textContent || '').replace(/\\s+/g, ' ').trim()).slice(0, 120);
  }

  return {
    articleCount: articles.length,
    externalIds,
    canonicalUrls,
    lastFingerprint: lastText + '|' + (externalIds[externalIds.length - 1] || '') + '|' + articles.length,
  };
})()
`;

export async function captureFeedFingerprint(page: Page): Promise<FeedFingerprint> {
  const raw = (await page.evaluate(FEED_FINGERPRINT_SCRIPT)) as FeedFingerprint;
  return {
    articleCount: Number(raw.articleCount) || 0,
    externalIds: Array.isArray(raw.externalIds) ? raw.externalIds.map(String) : [],
    canonicalUrls: Array.isArray(raw.canonicalUrls) ? raw.canonicalUrls.map(String) : [],
    lastFingerprint: String(raw.lastFingerprint || ''),
  };
}

export function feedFingerprintChanged(before: FeedFingerprint, after: FeedFingerprint): boolean {
  if (after.articleCount > before.articleCount) return true;
  if (after.lastFingerprint && after.lastFingerprint !== before.lastFingerprint) return true;

  const beforeIds = new Set(before.externalIds);
  for (const id of after.externalIds) {
    if (!beforeIds.has(id)) return true;
  }

  const beforeUrls = new Set(before.canonicalUrls);
  for (const url of after.canonicalUrls) {
    if (!beforeUrls.has(url)) return true;
  }

  return false;
}

/**
 * After scroll + pause, poll up to loadWaitMs for feed change signals.
 * Returns true if any signal appeared; false means this pass may be empty
 * but caller must NOT stop after a single empty pass.
 */
export async function waitForFeedLoad(
  page: Page,
  before: FeedFingerprint,
  loadWaitMs: number,
): Promise<{ changed: boolean; after: FeedFingerprint }> {
  const deadline = Date.now() + Math.max(0, loadWaitMs);
  let after = await captureFeedFingerprint(page);
  if (feedFingerprintChanged(before, after)) {
    return { changed: true, after };
  }

  while (Date.now() < deadline) {
    await page.waitForTimeout(250);
    after = await captureFeedFingerprint(page);
    if (feedFingerprintChanged(before, after)) {
      return { changed: true, after };
    }
  }

  return { changed: false, after };
}

/**
 * Targeted feed scroll.
 *
 * Unlike `page.mouse.wheel`, this never scrolls whatever happens to be under the
 * cursor (e.g. a comment area inside a modal). It drives the group feed's own
 * scroll container and brings the last feed post into view to trigger lazy load.
 * Callers MUST ensure the tab is on the group feed (no dialog) before calling.
 */
export async function scrollGroupFeed(page: Page): Promise<void> {
  await performFeedScroll(page, 1600);
}

export interface FeedScrollMeasurement {
  feedScrollTop: number;
  feedScrollHeight: number;
  commentScrollTop: number;
  documentScrollTop: number;
}

// STRING script (tsx/esbuild keepNames safe — see facebookNavigationState note).
const MEASURE_FEED_SCROLL_SCRIPT = `(() => {
  function scrollTopOf(el) {
    var cur = el;
    while (cur && cur !== document.body) {
      var oy = getComputedStyle(cur).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur.scrollTop;
      cur = cur.parentElement;
    }
    return 0;
  }
  var feed = document.querySelector('[role="feed"]');
  var dialog = document.querySelector('[role="dialog"]');
  var commentScrollTop = 0;
  if (dialog) {
    var nodes = dialog.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.scrollHeight > n.clientHeight && n.scrollTop > commentScrollTop) commentScrollTop = n.scrollTop;
    }
  }
  var de = document.scrollingElement || document.documentElement;
  return {
    feedScrollTop: feed ? scrollTopOf(feed) : 0,
    feedScrollHeight: feed ? feed.scrollHeight : 0,
    commentScrollTop: commentScrollTop,
    documentScrollTop: de ? de.scrollTop : 0,
  };
})()`;

export async function measureFeedScroll(page: Page): Promise<FeedScrollMeasurement> {
  return page
    .evaluate(MEASURE_FEED_SCROLL_SCRIPT)
    .then(r => r as FeedScrollMeasurement)
    .catch(() => ({ feedScrollTop: 0, feedScrollHeight: 0, commentScrollTop: 0, documentScrollTop: 0 }));
}

export type FeedScrollOutcome = 'success' | 'wrong_target' | 'no_change';

/**
 * Pure scroll-outcome classifier (unit-testable).
 * - success: feed scrollTop/height advanced, document advanced, or accepted-post
 *   fingerprint changed.
 * - wrong_target: only a comment/dialog scroll container advanced.
 * - no_change: nothing moved.
 */
export function classifyScrollOutcome(input: {
  feedScrollTopBefore: number;
  feedScrollTopAfter: number;
  feedScrollHeightBefore: number;
  feedScrollHeightAfter: number;
  documentScrollTopBefore: number;
  documentScrollTopAfter: number;
  commentScrollTopBefore: number;
  commentScrollTopAfter: number;
  fingerprintChanged: boolean;
}): FeedScrollOutcome {
  const feedAdvanced =
    input.feedScrollTopAfter > input.feedScrollTopBefore ||
    input.documentScrollTopAfter > input.documentScrollTopBefore ||
    input.feedScrollHeightAfter > input.feedScrollHeightBefore;

  if (feedAdvanced || input.fingerprintChanged) return 'success';

  if (input.commentScrollTopAfter > input.commentScrollTopBefore) return 'wrong_target';

  return 'no_change';
}

/** Scroll the group feed / document scrolling element by `amount` (never a dialog). */
async function performFeedScroll(page: Page, amount: number): Promise<void> {
  const px = Number(amount) || 0;
  // STRING script (tsx/esbuild keepNames safe); amount interpolated as a number.
  const script = `(() => {
    var feed = document.querySelector('[role="feed"]');
    if (feed) {
      var posts = Array.prototype.slice.call(feed.querySelectorAll('[role="article"]')).filter(function (article) {
        if (article.closest('[role="dialog"]')) return false;
        var parent = article.parentElement;
        if (parent && parent.closest('[role="article"]')) return false;
        return true;
      });
      var last = posts[posts.length - 1];
      if (last) last.scrollIntoView({ block: 'end', behavior: 'auto' });
    }
    var de = document.scrollingElement || document.documentElement;
    if (de) de.scrollBy(0, ${px});
    window.scrollBy(0, ${px});
  })()`;
  await page.evaluate(script).catch(() => undefined);
}

export interface ScrollFacebookGroupFeedInput {
  page: Page;
  feed: Locator;
  sourceUrl: string;
  scrollAmount?: number;
  pauseMs?: number;
  loadWaitMs?: number;
  /** Recovery hook called once before a wrong-target retry (ensureGroupFeedState) */
  recoverFeed?: () => Promise<boolean>;
}

export interface ScrollFacebookGroupFeedResult {
  outcome: FeedScrollOutcome;
  attempts: number;
  retried: boolean;
  commentScrollDetected: boolean;
  fingerprintChanged: boolean;
  before: FeedScrollMeasurement;
  after: FeedScrollMeasurement;
  errorCode?: string;
  stopReason?: string;
}

/**
 * Targeted, measured feed scroll with wrong-target detection + single retry.
 * The tab MUST be on the group feed (no dialog) before calling.
 */
export async function scrollFacebookGroupFeed(
  input: ScrollFacebookGroupFeedInput,
): Promise<ScrollFacebookGroupFeedResult> {
  const { page } = input;
  const scrollAmount = input.scrollAmount ?? 1600;
  const pauseMs = input.pauseMs ?? 2000;
  const loadWaitMs = input.loadWaitMs ?? 1500;

  const runOnce = async (): Promise<{
    before: FeedScrollMeasurement;
    after: FeedScrollMeasurement;
    fingerprintChanged: boolean;
  }> => {
    const fpBefore = await captureFeedFingerprint(page);
    const before = await measureFeedScroll(page);
    await performFeedScroll(page, scrollAmount);
    await page.waitForTimeout(pauseMs);
    const { changed } = await waitForFeedLoad(page, fpBefore, loadWaitMs);
    const after = await measureFeedScroll(page);
    return { before, after, fingerprintChanged: changed };
  };

  const first = await runOnce();
  let outcome = classifyScrollOutcome({
    feedScrollTopBefore: first.before.feedScrollTop,
    feedScrollTopAfter: first.after.feedScrollTop,
    feedScrollHeightBefore: first.before.feedScrollHeight,
    feedScrollHeightAfter: first.after.feedScrollHeight,
    documentScrollTopBefore: first.before.documentScrollTop,
    documentScrollTopAfter: first.after.documentScrollTop,
    commentScrollTopBefore: first.before.commentScrollTop,
    commentScrollTopAfter: first.after.commentScrollTop,
    fingerprintChanged: first.fingerprintChanged,
  });
  let commentScrollDetected = first.after.commentScrollTop > first.before.commentScrollTop;

  if (outcome !== 'wrong_target') {
    return {
      outcome,
      attempts: 1,
      retried: false,
      commentScrollDetected,
      fingerprintChanged: first.fingerprintChanged,
      before: first.before,
      after: first.after,
    };
  }

  // Wrong target — recover once, then retry exactly one time.
  if (input.recoverFeed) await input.recoverFeed().catch(() => false);
  const second = await runOnce();
  outcome = classifyScrollOutcome({
    feedScrollTopBefore: second.before.feedScrollTop,
    feedScrollTopAfter: second.after.feedScrollTop,
    feedScrollHeightBefore: second.before.feedScrollHeight,
    feedScrollHeightAfter: second.after.feedScrollHeight,
    documentScrollTopBefore: second.before.documentScrollTop,
    documentScrollTopAfter: second.after.documentScrollTop,
    commentScrollTopBefore: second.before.commentScrollTop,
    commentScrollTopAfter: second.after.commentScrollTop,
    fingerprintChanged: second.fingerprintChanged,
  });
  commentScrollDetected =
    commentScrollDetected || second.after.commentScrollTop > second.before.commentScrollTop;

  const result: ScrollFacebookGroupFeedResult = {
    outcome,
    attempts: 2,
    retried: true,
    commentScrollDetected,
    fingerprintChanged: second.fingerprintChanged,
    before: first.before,
    after: second.after,
  };
  if (outcome === 'wrong_target') {
    result.errorCode = WRONG_SCROLL_TARGET_ERROR_CODE;
    result.stopReason = WRONG_SCROLL_TARGET_STOP_REASON;
  }
  return result;
}

export async function scrollFacebookFeed(
  page: Page,
  config: FacebookScrollConfig,
  startedAt: number,
): Promise<FacebookScrollState> {
  if (config.maxScrolls <= 0) {
    return { scrollsPerformed: 0, stoppedReason: 'manual' };
  }

  const elapsedSec = (Date.now() - startedAt) / 1000;
  if (elapsedSec >= config.maxDurationSeconds) {
    return { scrollsPerformed: 0, stoppedReason: 'max_duration' };
  }

  const before = await captureFeedFingerprint(page);
  await scrollGroupFeed(page);
  await page.waitForTimeout(config.scrollPauseMs);

  const loadWaitMs = config.loadWaitMs ?? 1500;
  const { changed } = await waitForFeedLoad(page, before, loadWaitMs);

  return {
    scrollsPerformed: 1,
    stoppedReason: 'manual',
    feedChanged: changed,
  };
}

export function shouldStopScrolling(input: {
  scrollsPerformed: number;
  maxScrolls: number;
  startedAt: number;
  maxDurationSeconds: number;
  knownPostsStreak: number;
  knownPostStopStreak?: number;
  /** @deprecated use knownPostStopStreak */
  stopAfterKnownPosts?: number;
  consecutiveEmptyPasses?: number;
  maxEmptyPasses?: number;
}): FacebookScrollStopReason | null {
  const knownThreshold =
    input.knownPostStopStreak ?? input.stopAfterKnownPosts ?? 8;

  if (input.knownPostsStreak >= knownThreshold) {
    return 'known_post_streak';
  }
  if (input.scrollsPerformed >= input.maxScrolls) {
    return 'max_scrolls';
  }
  const elapsedSec = (Date.now() - input.startedAt) / 1000;
  if (elapsedSec >= input.maxDurationSeconds) {
    return 'max_duration';
  }
  if (
    input.maxEmptyPasses != null &&
    input.consecutiveEmptyPasses != null &&
    input.consecutiveEmptyPasses >= input.maxEmptyPasses
  ) {
    return 'consecutive_empty_passes';
  }
  return null;
}

export async function ensureFacebookDiscussionTab(page: Page): Promise<boolean> {
  const tab = page.getByRole('tab', { name: /thảo luận|discussion/i }).first();
  const selected = await tab.getAttribute('aria-selected').catch(() => null);
  if (selected === 'true') return true;
  const visible = await tab.isVisible().catch(() => false);
  if (!visible) return false;
  await tab.click({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(2000);
  return true;
}

export async function switchFacebookFeedTab(
  page: Page,
  feedTab: string | undefined,
): Promise<boolean> {
  if (!feedTab || feedTab === 'default') return false;

  const patterns: Record<string, RegExp> = {
    discussion: /thảo luận|discussion/i,
    new: /mới nhất|new posts/i,
    featured: /nổi bật|featured/i,
  };

  const pattern = patterns[feedTab];
  if (!pattern) return false;

  const tab = page.getByRole('tab', { name: pattern }).first();
  const visible = await tab.isVisible().catch(() => false);
  if (!visible) {
    console.warn(`[facebook] Feed tab "${feedTab}" not found — @calibrate selectors`);
    return false;
  }

  await tab.click({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  return true;
}
