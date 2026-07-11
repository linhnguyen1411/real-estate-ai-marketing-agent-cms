import type { Page } from 'playwright';

export type FacebookScrollStopReason =
  | 'max_scrolls'
  | 'max_duration'
  | 'known_post_streak'
  | 'consecutive_empty_passes'
  | 'max_posts'
  | 'manual';

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
  const articles = Array.from(document.querySelectorAll('[role="article"]'));
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
  await page.mouse.wheel(0, 1600);
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
