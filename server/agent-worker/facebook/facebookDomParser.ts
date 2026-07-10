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
}

/** Serialized extraction script — keeps selectors in TS module, logic in browser context. */
const EXTRACT_POSTS_SCRIPT = `
(() => {
  const SEE_MORE = /xem thêm|see more|xem thể/i;
  const posts = [];
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

  for (const article of articles) {
    const permalink = extractPermalink(article);
    const body = extractBody(article);
    if (!body || body.length < 15) continue;
    const author = extractAuthor(article);
    const fullText = pickText(article);
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
    });
  }

  return posts;
})()
`;

export async function parseVisibleFacebookPosts(page: Page): Promise<FacebookPostParsed[]> {
  const raw = await page.evaluate(EXTRACT_POSTS_SCRIPT) as FacebookPostParsed[];
  return raw.map(post => ({
    ...post,
    canonicalUrl: normalizeFacebookUrl(post.canonicalUrl, page.url()),
    rawData: {
      publishedLabel: post.publishedLabel,
      metrics: post.metrics,
      parser: 'facebookDomParser@v1',
      needsCalibration: true,
    },
  }));
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
