import type { Page } from 'playwright';
import {
  FB_AUTHOR_LINK_SELECTOR,
  FB_METRIC_PATTERN,
  FB_PERMALINK_SELECTOR,
  FB_POST_BODY_SELECTORS,
  FB_POST_ROOT,
  FB_SEE_MORE_PATTERN,
  FB_TIME_SELECTORS,
} from './facebookSelectors';

export interface FacebookPostParsed {
  externalId: string | null;
  canonicalUrl: string;
  authorName: string | null;
  authorUrl: string | null;
  contentText: string;
  publishedAt: string | null;
  publishedLabel: string | null;
  metrics: Record<string, number | string>;
  rawData: Record<string, unknown>;
  title: string;
  /** Pinned/featured — must not alone stop incremental scan */
  isPinned: boolean;
}

/** Serialized extraction script — keeps selectors in TS module, logic in browser context. */
const EXTRACT_POSTS_SCRIPT = `
(() => {
  const posts = [];
  let parseFailed = 0;
  const articles = document.querySelectorAll('[role="article"]');

  function pickText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
  }

  function extractPermalink(article) {
    const links = article.querySelectorAll('a[href*="/posts/"], a[href*="permalink"], a[href*="story_fbid"]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (href) return href.startsWith('http') ? href : 'https://www.facebook.com' + href;
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

  function extractAuthor(article) {
    const authorLink = article.querySelector('h2 a[role="link"], strong a[role="link"], a[href*="/user/"], a[href*="/profile.php"]');
    if (!authorLink) return { name: null, url: null };
    const name = pickText(authorLink);
    const href = authorLink.getAttribute('href') || '';
    const url = href ? (href.startsWith('http') ? href : 'https://www.facebook.com' + href) : null;
    return { name: name || null, url };
  }

  function extractBody(article) {
    const selectors = [
      '[data-ad-preview="message"]',
      '[data-ad-comet-preview="message"]',
      'div[dir="auto"]',
    ];
    for (const sel of selectors) {
      const nodes = article.querySelectorAll(sel);
      const texts = Array.from(nodes).map(pickText).filter(t => t.length > 20);
      if (texts.length) return texts.sort((a, b) => b.length - a.length)[0];
    }
    return pickText(article).slice(0, 4000);
  }

  function extractTimeLabel(article) {
    for (const sel of ['a[href*="/posts/"] abbr', 'abbr', 'a[aria-label]']) {
      const node = article.querySelector(sel);
      if (!node) continue;
      const label = node.getAttribute('aria-label') || node.getAttribute('title') || pickText(node);
      if (label) return label;
    }
    return null;
  }

  function extractMetrics(text) {
    const metrics = {};
    const re = /(\\d+[\\d.,]*)\\s*(lượt thích|likes?|bình luận|comments?|chia sẻ|shares?)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = m[2].toLowerCase().includes('comment') || m[2].includes('bình luận')
        ? 'comments'
        : m[2].toLowerCase().includes('share') || m[2].includes('chia')
          ? 'shares'
          : 'likes';
      metrics[key] = m[1];
    }
    return metrics;
  }

  function detectPinned(article, fullText) {
    const head = fullText.slice(0, 280);
    if (/\\b(ghim|đã ghim|pinned|pin to top|featured post|bài viết nổi bật)\\b/i.test(head)) return true;
    const aria = (article.getAttribute('aria-label') || '') + ' ' + (article.getAttribute('aria-description') || '');
    if (/\\b(pinned|ghim|featured)\\b/i.test(aria)) return true;
    const badge = article.querySelector('[aria-label*="Pinned" i], [aria-label*="Ghim" i], [aria-label*="ghim" i]');
    return Boolean(badge);
  }

  for (const article of articles) {
    const permalink = extractPermalink(article);
    const body = extractBody(article);
    if (!body || body.length < 15) {
      parseFailed += 1;
      continue;
    }
    const author = extractAuthor(article);
    const fullText = pickText(article);
    const isPinned = detectPinned(article, fullText);
    posts.push({
      externalId: extractExternalId(permalink),
      canonicalUrl: permalink || window.location.href,
      authorName: author.name,
      authorUrl: author.url,
      contentText: body,
      publishedLabel: extractTimeLabel(article),
      publishedAt: null,
      metrics: extractMetrics(fullText),
      title: author.name ? author.name + ': ' + body.slice(0, 80) : body.slice(0, 100),
      isPinned,
    });
  }

  return { posts, articleCount: articles.length, parseFailed };
})()
`;

export interface FacebookParsePassResult {
  posts: FacebookPostParsed[];
  articleCount: number;
  parseFailed: number;
}

export async function parseVisibleFacebookPostsWithStats(
  page: Page,
): Promise<FacebookParsePassResult> {
  const raw = (await page.evaluate(EXTRACT_POSTS_SCRIPT)) as {
    posts?: Array<Partial<FacebookPostParsed>>;
    articleCount?: number;
    parseFailed?: number;
  };

  const posts = (raw.posts || []).map(post => ({
    externalId: post.externalId ?? null,
    canonicalUrl: normalizeFacebookUrl(String(post.canonicalUrl || ''), page.url()),
    authorName: post.authorName ?? null,
    authorUrl: post.authorUrl ?? null,
    contentText: String(post.contentText || ''),
    publishedAt: post.publishedAt ?? null,
    publishedLabel: post.publishedLabel ?? null,
    metrics: post.metrics ?? {},
    title: String(post.title || ''),
    isPinned: Boolean(post.isPinned),
    rawData: {
      publishedLabel: post.publishedLabel ?? null,
      metrics: post.metrics ?? {},
      isPinned: Boolean(post.isPinned),
      parser: 'facebookDomParser@v2',
      needsCalibration: true,
    },
  }));

  return {
    posts,
    articleCount: Number(raw.articleCount) || posts.length,
    parseFailed: Number(raw.parseFailed) || 0,
  };
}

export async function parseVisibleFacebookPosts(page: Page): Promise<FacebookPostParsed[]> {
  const result = await parseVisibleFacebookPostsWithStats(page);
  return result.posts;
}

export async function expandSeeMoreInPosts(page: Page, maxClicks = 8): Promise<number> {
  let clicks = 0;
  const buttons = page.getByRole('button', { name: FB_SEE_MORE_PATTERN });
  const count = await buttons.count();

  for (let i = 0; i < Math.min(count, maxClicks); i++) {
    const btn = buttons.nth(i);
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) continue;
    await btn.click({ timeout: 3000 }).catch(() => undefined);
    clicks += 1;
    await page.waitForTimeout(400);
  }

  return clicks;
}

export function normalizeFacebookUrl(href: string, fallback: string): string {
  try {
    if (!href) return fallback;
    const url = new URL(href, 'https://www.facebook.com');
    url.hash = '';
    return url.toString();
  } catch {
    return fallback;
  }
}

export async function countPostArticles(page: Page): Promise<number> {
  return page.locator(FB_POST_ROOT).count();
}

/** @internal re-export for docs/tests */
export const SELECTOR_REFERENCE = {
  FB_POST_ROOT,
  FB_PERMALINK_SELECTOR,
  FB_AUTHOR_LINK_SELECTOR,
  FB_POST_BODY_SELECTORS,
  FB_TIME_SELECTORS,
  FB_SEE_MORE_PATTERN,
  FB_METRIC_PATTERN,
};
