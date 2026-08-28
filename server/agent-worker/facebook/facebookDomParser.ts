import type { Locator, Page } from 'playwright';
import {
  classifyFacebookArticle,
  type FacebookArticleKind,
  type FacebookArticleSignals,
} from './facebookArticleClassifier';
import { FB_FEED_RUNTIME_JS } from './facebookFeedLocator';
import { applyFacebookPostIdentity } from './facebookPermalinkResolver';
import { canonicalizeFacebookPostUrl } from '../../../shared/facebook-url';
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

/** Raw per-article payload returned from the browser context (before classify). */
interface RawArticle {
  signals: FacebookArticleSignals;
  permalink: string;
  externalId: string | null;
  authorName: string | null;
  authorUrl: string | null;
  contentText: string;
  publishedLabel: string | null;
  metrics: Record<string, string>;
  isPinned: boolean;
}

/**
 * Browser-context extraction. Scoped strictly to the group feed root and to the
 * MAIN content block of each post (never the whole article, so nested comments
 * are excluded). Returns per-article signals; classification happens in Node.
 */
const EXTRACT_POSTS_SCRIPT = `(() => {
  ${FB_FEED_RUNTIME_JS}

  function pickText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
  }

  function closestArticle(el) {
    return el && el.closest ? el.closest('[role="article"]') : null;
  }

  function isInsideNestedArticle(el, article) {
    var a = closestArticle(el);
    return a && a !== article;
  }

  function isInsideComments(el) {
    return !!(el.closest && el.closest('[aria-label*="Comment" i], [aria-label*="bình luận" i], [aria-label*="Bình luận" i]'));
  }

  function isPhotoMediaHref(full) {
    return /photo\.php|\/photo\/|\/photos\/|fbid=/i.test(full);
  }

  function toFullHref(href) {
    if (!href) return '';
    return href.charAt(0) === '/' ? 'https://www.facebook.com' + href : href;
  }

  function extractPermalink(article) {
    // 1) Timestamp link (abbr) — story permalink, not image lightbox.
    var timeAnchors = article.querySelectorAll(
      'a[href*="/posts/"] abbr, a[href*="/permalink/"] abbr, a[href*="story_fbid"] abbr',
    );
    for (var t = 0; t < timeAnchors.length; t++) {
      var abbr = timeAnchors[t];
      if (isInsideNestedArticle(abbr, article)) continue;
      var anchor = abbr.closest ? abbr.closest('a[href]') : null;
      if (!anchor) continue;
      var thref = anchor.getAttribute('href') || '';
      if (!thref || /comment_id=/i.test(thref)) continue;
      var tfull = toFullHref(thref);
      if (isPhotoMediaHref(tfull)) continue;
      return tfull.split('?')[0];
    }

    // 2) Score remaining candidates — deprioritize photo/media links.
    var links = article.querySelectorAll('a[href*="/posts/"], a[href*="permalink"], a[href*="story_fbid"]');
    var best = '';
    var bestScore = -1;
    var commentFallback = '';
    for (var i = 0; i < links.length; i++) {
      if (isInsideNestedArticle(links[i], article)) continue;
      var href = links[i].getAttribute('href') || '';
      if (!href) continue;
      var full = toFullHref(href);
      if (isPhotoMediaHref(full)) continue;
      if (/comment_id=/i.test(full)) {
        if (!commentFallback) commentFallback = full;
        continue;
      }
      var score = 0;
      if (/story_fbid=/i.test(full)) score = 5;
      else if (/\/permalink\//i.test(full)) score = 4;
      else if (/\/posts\//i.test(full)) score = 3;
      if (score > bestScore) {
        bestScore = score;
        best = full;
      }
    }
    if (best) return best.split('?')[0];
    return commentFallback ? commentFallback.split('?')[0] : '';
  }

  function extractExternalId(url) {
    if (!url) return null;
    var m = url.match(/\\/posts\\/(\\d+)/); if (m) return m[1];
    var f = url.match(/story_fbid=(\\d+)/); if (f) return f[1];
    var p = url.match(/(pfbid\\w+)/); if (p) return p[1];
    return null;
  }

  function extractAuthor(article) {
    var link = article.querySelector('h2 a[role="link"], strong a[role="link"], a[href*="/user/"], a[href*="/profile.php"]');
    if (!link || isInsideNestedArticle(link, article)) return { name: null, url: null };
    var name = pickText(link);
    var href = link.getAttribute('href') || '';
    var url = href ? (href.charAt(0) === '/' ? 'https://www.facebook.com' + href : href) : null;
    return { name: name || null, url: url };
  }

  // MAIN content only: explicit message block, else dir=auto blocks that are NOT
  // inside a nested comment article and NOT inside a comments region.
  function isActionLabel(txt) {
    return /^(thích|like|bình luận|comment|chia sẻ|share|trả lời|reply|xem thêm|see more|\\d+ phút|\\d+ giờ|\\d+ ngày|theo dõi|follow|gửi|send)$/i.test(txt.trim());
  }

  function extractMainContent(article) {
    // 1) explicit message block (may be split across spans -> use its full text)
    var msg = article.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"], div[data-ad-rendering-role="story_message"]');
    if (msg && !isInsideNestedArticle(msg, article) && !isInsideComments(msg)) {
      var t = pickText(msg);
      if (t && t.length >= 10) return t;
    }
    // 2) join dir=auto blocks belonging to the post body (not comments/nested/UI)
    var nodes = article.querySelectorAll('div[dir="auto"], span[dir="auto"]');
    var texts = [];
    var seen = {};
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (isInsideNestedArticle(n, article)) continue;
      if (isInsideComments(n)) continue;
      var txt = pickText(n);
      if (!txt || txt.length < 2) continue;
      if (isActionLabel(txt)) continue;
      if (seen[txt]) continue;
      // skip blocks fully contained in an already-captured longer block
      seen[txt] = true;
      texts.push(txt);
    }
    if (texts.length) {
      // prefer the single longest coherent block, but fall back to a join when
      // the body was split into several short spans.
      texts.sort(function (a, b) { return b.length - a.length; });
      var longest = texts[0];
      if (longest.length >= 20) return longest;
      var joined = texts.join(' ').replace(/\\s+/g, ' ').trim();
      return joined;
    }
    // 3) Fallback: strip feed chrome from full article text (live FB often omits message block)
    var full = pickText(article);
    if (full.length >= 20) {
      var body = full
        .replace(/\\s+\\d+\\s+(phút|giờ|ngày|tuần|tháng|năm|minute|hour|day|week|month|year)s?\\b.*$/i, '')
        .replace(/\\s*(Thích|Like|Bình luận|Comment|Chia sẻ|Share|Trả lời|Reply)(?:\\s+\\d+)?(?:\\s+(Thích|Like|Bình luận|Comment|Chia sẻ|Share|Trả lời|Reply)(?:\\s+\\d+)?)*\\s*$/gi, '')
        .trim();
      if (body.length >= 15) return body;
    }
    return '';
  }

  function extractTimeLabel(article) {
    var sels = ['a[href*="/posts/"] abbr', 'abbr', 'a[aria-label]'];
    for (var s = 0; s < sels.length; s++) {
      var node = article.querySelector(sels[s]);
      if (!node || isInsideNestedArticle(node, article)) continue;
      var label = node.getAttribute('aria-label') || node.getAttribute('title') || pickText(node);
      if (label) return label;
    }
    return null;
  }

  function extractMetrics(text) {
    var metrics = {};
    var re = /(\\d+[\\d.,]*)\\s*(lượt thích|likes?|bình luận|comments?|chia sẻ|shares?)/gi;
    var m;
    while ((m = re.exec(text)) !== null) {
      var key = (m[2].toLowerCase().indexOf('comment') >= 0 || m[2].indexOf('bình luận') >= 0)
        ? 'comments'
        : (m[2].toLowerCase().indexOf('share') >= 0 || m[2].indexOf('chia') >= 0) ? 'shares' : 'likes';
      metrics[key] = m[1];
    }
    return metrics;
  }

  function detectPinned(article, fullText) {
    var head = fullText.slice(0, 280);
    if (/\\b(ghim|đã ghim|pinned|pin to top|featured post|bài viết nổi bật)\\b/i.test(head)) return true;
    var aria = (article.getAttribute('aria-label') || '') + ' ' + (article.getAttribute('aria-description') || '');
    if (/\\b(pinned|ghim|featured)\\b/i.test(aria)) return true;
    return !!article.querySelector('[aria-label*="Pinned" i], [aria-label*="Ghim" i], [aria-label*="ghim" i]');
  }

  function articleDepthOf(article) {
    var depth = 0;
    var cur = article.parentElement;
    while (cur) {
      if (cur.matches && cur.matches('[role="article"]')) depth++;
      cur = cur.parentElement;
    }
    return depth;
  }

  function hasActionLabel(article, re) {
    var nodes = article.querySelectorAll('[aria-label], [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (closestArticle(n) !== article) continue; // skip nested comments
      var label = (n.getAttribute('aria-label') || n.textContent || '').toLowerCase();
      if (re.test(label)) return true;
    }
    return false;
  }

  function computeSignals(article) {
    var depth = articleDepthOf(article);
    var permalink = extractPermalink(article);
    var story = /story_fbid/.test(permalink) || !!article.querySelector('a[href*="story_fbid"]');
    var authorLink = article.querySelector('h2 a[role="link"], strong a[role="link"], a[href*="/user/"], a[href*="/profile.php"]');
    var timeLink = article.querySelector('a[href*="/posts/"] abbr, abbr');
    var hasLike = hasActionLabel(article, /thích|like/);
    var hasComment = hasActionLabel(article, /bình luận|comment/);
    var hasShare = hasActionLabel(article, /chia sẻ|share/);
    var hasReply = hasActionLabel(article, /trả lời|\\breply\\b|\\breplies\\b|phản hồi/);
    var composer = article.querySelector('[contenteditable="true"], textarea, [aria-label*="Viết bình luận" i], [aria-label*="Write a comment" i]');
    var ariaBlob = (article.getAttribute('aria-label') || '') + ' ' + (article.getAttribute('aria-description') || '');
    var isFeedCommentArticle = /bình luận dưới tên|phản hồi dưới tên|comment by|comment on/i.test(ariaBlob);
    var text = pickText(article);
    return {
      articleDepth: depth,
      insideDialog: !!article.closest('[role="dialog"]'),
      insideCommentsRegion: isInsideComments(article) || isFeedCommentArticle,
      hasPostPermalink: /\\/posts\\//.test(permalink) || /permalink/.test(permalink),
      hasStoryFbid: !!story,
      hasAuthorLink: !!(authorLink && closestArticle(authorLink) === article),
      hasTimestampLink: !!(timeLink && closestArticle(timeLink) === article),
      hasPostActionBar: hasLike && hasShare,
      hasLikeAction: hasLike,
      hasCommentAction: hasComment,
      hasShareAction: hasShare,
      hasReplyAction: hasReply,
      hasCommentComposer: !!composer,
      isFeedCommentArticle: isFeedCommentArticle,
      textLength: text.length,
    };
  }

  var feed = __fbFindFeedRoot();
  if (!feed) {
    return { articles: [], articleNodesObserved: 0, noFeed: true };
  }

  var allArticles = Array.prototype.slice.call(feed.querySelectorAll('[role="article"]'));
  var out = [];
  var loadingSkipped = 0;
  for (var i = 0; i < allArticles.length; i++) {
    var article = allArticles[i];
    if (__fbIsLoadingArticle(article)) {
      loadingSkipped++;
      continue;
    }
    var signals = computeSignals(article);
    var permalink = extractPermalink(article);
    var author = extractAuthor(article);
    var fullText = pickText(article);
    out.push({
      signals: signals,
      permalink: permalink,
      externalId: extractExternalId(permalink),
      authorName: author.name,
      authorUrl: author.url,
      contentText: extractMainContent(article),
      publishedLabel: extractTimeLabel(article),
      metrics: extractMetrics(fullText),
      isPinned: detectPinned(article, fullText),
    });
  }

  return { articles: out, articleNodesObserved: allArticles.length, loadingArticlesSkipped: loadingSkipped, noFeed: false };
})()`;

export interface FacebookParsePassResult {
  posts: FacebookPostParsed[];
  /** All `[role="article"]` nodes seen inside the feed root */
  articleNodesObserved: number;
  /** Articles classified as posts (top-level candidates) */
  postCandidates: number;
  /** Posts with usable content (accepted for insert) */
  postsAccepted: number;
  commentsRejected: number;
  unknownArticlesRejected: number;
  parseFailed: number;
  /** Feed root absent (not on group feed) */
  noFeed: boolean;
  /** @deprecated alias of articleNodesObserved */
  articleCount: number;
}

export async function parseVisibleFacebookPostsWithStats(
  page: Page,
): Promise<FacebookParsePassResult> {
  const raw = (await page.evaluate(EXTRACT_POSTS_SCRIPT)) as {
    articles?: RawArticle[];
    articleNodesObserved?: number;
    noFeed?: boolean;
  };

  if (raw.noFeed) {
    return {
      posts: [],
      articleNodesObserved: 0,
      postCandidates: 0,
      postsAccepted: 0,
      commentsRejected: 0,
      unknownArticlesRejected: 0,
      parseFailed: 0,
      noFeed: true,
      articleCount: 0,
    };
  }

  const articles = raw.articles || [];
  const posts: FacebookPostParsed[] = [];
  let postCandidates = 0;
  let commentsRejected = 0;
  let unknownArticlesRejected = 0;
  let parseFailed = 0;

  for (const item of articles) {
    const kind: FacebookArticleKind = classifyFacebookArticle(item.signals);

    if (kind === 'comment') {
      commentsRejected += 1;
      continue;
    }
    if (kind === 'unknown') {
      unknownArticlesRejected += 1;
      continue;
    }

    // kind === 'post'
    postCandidates += 1;
    const body = String(item.contentText || '');
    if (!body || body.length < 15) {
      parseFailed += 1;
      continue;
    }

    const canonicalUrl = normalizeFacebookUrl(item.permalink || '', page.url());
    const groupUrl = page.url().split('?')[0].replace(/\/$/, '');
    posts.push(
      applyFacebookPostIdentity(
        {
          externalId: item.externalId ?? null,
          canonicalUrl,
          authorName: item.authorName ?? null,
          authorUrl: item.authorUrl ?? null,
          contentText: body,
          publishedAt: null,
          publishedLabel: item.publishedLabel ?? null,
          metrics: item.metrics ?? {},
          title: item.authorName ? `${item.authorName}: ${body.slice(0, 80)}` : body.slice(0, 100),
          isPinned: Boolean(item.isPinned),
          rawData: {
            publishedLabel: item.publishedLabel ?? null,
            metrics: item.metrics ?? {},
            isPinned: Boolean(item.isPinned),
            articleKind: kind,
            signals: item.signals,
            parser: 'facebookDomParser@v4-permalink',
          },
        },
        groupUrl,
      ),
    );
  }

  return {
    posts,
    articleNodesObserved: Number(raw.articleNodesObserved) || articles.length,
    postCandidates,
    postsAccepted: posts.length,
    commentsRejected,
    unknownArticlesRejected,
    parseFailed,
    noFeed: false,
    articleCount: Number(raw.articleNodesObserved) || articles.length,
  };
}

export async function parseVisibleFacebookPosts(page: Page): Promise<FacebookPostParsed[]> {
  const result = await parseVisibleFacebookPostsWithStats(page);
  return result.posts;
}

/**
 * Expand a single post's "See more" body — EXACT accessible name only.
 * Never clicks "Xem thêm bình luận / phản hồi" or "View more comments / replies".
 */
export async function expandSeeMoreInPost(postLocator: Locator): Promise<number> {
  let clicks = 0;
  for (const name of ['Xem thêm', 'See more']) {
    const btn = postLocator.getByRole('button', { name, exact: true }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 3000 }).catch(() => undefined);
      clicks += 1;
    }
  }
  return clicks;
}

/**
 * Expand "See more" across feed posts — scoped per post card (feed direct
 * children), never at page level.
 */
export async function expandSeeMoreInFeedPosts(
  page: Page,
  feedLocator: Locator,
  maxPosts = 10,
): Promise<number> {
  if ((await feedLocator.count()) === 0) return 0;
  const cards = feedLocator.locator(':scope > div');
  const count = Math.min(await cards.count(), maxPosts);
  let clicks = 0;
  for (let i = 0; i < count; i++) {
    clicks += await expandSeeMoreInPost(cards.nth(i));
    if (clicks > 0) await page.waitForTimeout(300);
  }
  return clicks;
}

export function normalizeFacebookUrl(href: string, fallback: string): string {
  try {
    if (!href) return fallback;
    const url = new URL(href, 'https://www.facebook.com');
    url.hash = '';
    const raw = url.toString();
    return canonicalizeFacebookPostUrl(raw) || raw.replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

export async function countPostArticles(page: Page): Promise<number> {
  return page.locator(`${FB_FEED_ROOT} ${FB_POST_ROOT}`).count();
}

const FB_FEED_ROOT = '[role="feed"]';

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
