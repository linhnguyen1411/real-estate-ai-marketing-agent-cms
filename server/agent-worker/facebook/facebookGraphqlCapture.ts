/**
 * Capture Facebook group post bodies from GraphQL network responses.
 *
 * Live DOM often stays on skeleton ("Đang tải...") forever under CDP, while
 * GraphQL already returns the story message text. This module listens to
 * page responses and extracts candidate post texts + real post IDs / permalinks.
 */
import type { Page, Response } from 'playwright';
import type { FacebookPostParsed } from './facebookDomParser';
import { applyFacebookPostIdentity } from './facebookPermalinkResolver';
import { isFacebookGroupUrl } from './facebookSelectors';
import { sanitizeUnicodeString } from '../services/contentNormalizer';

export interface GraphqlCapturedPost {
  externalId: string | null;
  contentText: string;
  canonicalUrl: string;
  authorName: string | null;
  permalinkResolved: boolean;
}

export interface FacebookGraphqlCapture {
  drain(): GraphqlCapturedPost[];
  stats(): { responsesSeen: number; textsSeen: number; postsKept: number; withPermalink: number };
  detach(): void;
}

const NOISE =
  /^(https?:|Ảnh của |People |Bất kỳ ai|Bình luận đã|Người đóng góp|Giúp |Trang ·|Like |Thích |See more|Xem thêm)/i;

const LOOKS_LIKE_POST =
  /(?:tỷ|ty|t\.ỷ|zalo|zl\b|ib\b|inbox|cần (?:mua|tìm|thuê)|tìm nhà|tài chính|lh\b|liên hệ|hotline|\d{8,}|m2|phòng ngủ|kiệt|mặt tiền)/i;

function decodeJsonString(raw: string): string {
  try {
    return sanitizeUnicodeString(JSON.parse(`"${raw}"`));
  } catch {
    return sanitizeUnicodeString(
      raw
        .replace(/\\n/g, '\n')
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\'),
    );
  }
}

function isUsefulPostText(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 40 || t.length > 4000) return false;
  if (NOISE.test(t)) return false;
  if (/fbcdn\.net|rsrc\.php|graphql/i.test(t)) return false;
  if (!/[a-záàảãạăâéêíóôơúưýđ]/i.test(t)) return false;
  return LOOKS_LIKE_POST.test(t) || t.length >= 80;
}

function unescapeGraphqlUrl(raw: string): string {
  return raw.replace(/\\\//g, '/').replace(/\\u0025/g, '%');
}

function decodeFeedbackPostId(value: string): string | null {
  // base64 "feedback:<postId>"
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const m = decoded.match(/^feedback:(\d{8,})$/);
    if (m) return m[1];
  } catch {
    // ignore
  }
  return null;
}

/**
 * Look around a message "text" hit for a real group post id / permalink.
 * Facebook embeds post_id a few KB away from the message body — keep a wide window.
 */
export function extractPostIdentityNear(
  body: string,
  index: number,
  groupUrl: string,
): { postId: string | null; permalink: string | null } {
  const start = Math.max(0, index - 4000);
  const end = Math.min(body.length, index + 4000);
  const window = body.slice(start, end);

  const postIdPatterns = [
    /"post_id"\s*:\s*"(\d{8,})"/,
    /"legacy_story_id"\s*:\s*"(\d{8,})"/,
    /set=gm\.(\d{8,})/,
    /\\\/posts\\\/(\d{8,})/,
    /\/posts\/(\d{8,})/,
  ];
  for (const re of postIdPatterns) {
    const m = window.match(re);
    if (m) {
      const postId = m[1];
      return {
        postId,
        permalink: buildGroupPostPermalink(groupUrl, postId),
      };
    }
  }

  // feedback id is often base64("feedback:<postId>")
  const feedbackIds = [...window.matchAll(/"id"\s*:\s*"([A-Za-z0-9+/=]{20,})"/g)];
  for (const hit of feedbackIds) {
    const postId = decodeFeedbackPostId(hit[1]);
    if (postId) {
      return { postId, permalink: buildGroupPostPermalink(groupUrl, postId) };
    }
  }

  // Absolute facebook permalink nearby (group or personal)
  const urlMatch = window.match(
    /https:\\\/\\\/(?:www\.)?facebook\.com\\\/(?:groups\\\/[^"\\]+\\\/)?posts\\\/(\d{8,})[^"\\]*/,
  );
  if (urlMatch) {
    const postId = urlMatch[1];
    return {
      postId,
      permalink: unescapeGraphqlUrl(urlMatch[0]).split('?')[0],
    };
  }

  const permalinkPhp = window.match(
    /https:\\\/\\\/(?:www\.)?facebook\.com\\\/permalink\.php\?[^"\\]*story_fbid=(\d{8,})[^"\\]*/,
  );
  if (permalinkPhp) {
    return {
      postId: permalinkPhp[1],
      permalink: unescapeGraphqlUrl(permalinkPhp[0]).split('&amp;').join('&').split('#')[0],
    };
  }

  const wwwUrl = window.match(
    /"wwwURL"\s*:\s*"(https:\\\/\\\/(?:www\.)?facebook\.com\\\/[^"]+)"/,
  );
  if (wwwUrl) {
    const permalink = unescapeGraphqlUrl(wwwUrl[1]).split('?')[0];
    const idMatch =
      permalink.match(/\/posts\/(\d{8,})/) ||
      permalink.match(/story_fbid=(\d{8,})/) ||
      permalink.match(/\/(\d{8,})\/?$/);
    return { postId: idMatch?.[1] ?? null, permalink };
  }

  return { postId: null, permalink: null };
}

const GROUP_NAME_NOISE =
  /bất\s*động\s*sản|bat\s*dong\s*san|đà\s*nẵng|da\s*nang|hội\s*nhóm|group|admin|moder/i;

/**
 * Pull Facebook post author name near a message "text" hit in GraphQL payloads.
 * Prefers actors/owner/author blocks; skips group/page noise names.
 */
export function extractAuthorNear(body: string, index: number): string | null {
  const start = Math.max(0, index - 6000);
  const end = Math.min(body.length, index + 1500);
  const window = body.slice(start, end);

  const patterns = [
    /"actors"\s*:\s*\[\s*\{[^}]{0,400}?"name"\s*:\s*"((?:\\.|[^\\"]){2,80})"/,
    /"owner"\s*:\s*\{[^}]{0,400}?"name"\s*:\s*"((?:\\.|[^\\"]){2,80})"/,
    /"author"\s*:\s*\{[^}]{0,400}?"name"\s*:\s*"((?:\\.|[^\\"]){2,80})"/,
    /"comet_sections"[^]{0,800}?"actors"\s*:\s*\[\s*\{[^}]{0,400}?"name"\s*:\s*"((?:\\.|[^\\"]){2,80})"/,
  ];

  for (const re of patterns) {
    const m = window.match(re);
    if (!m) continue;
    const name = decodeJsonString(m[1]).replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 80) continue;
    if (GROUP_NAME_NOISE.test(name)) continue;
    if (/^https?:/i.test(name)) continue;
    return name;
  }
  return null;
}

export function buildGroupPostPermalink(groupUrl: string, postId: string): string {
  const base = groupUrl.replace(/\/$/, '');
  if (isFacebookGroupUrl(base)) {
    return `${base}/posts/${postId}/`;
  }
  // Personal / home feed — prefer story-style permalink
  return `https://www.facebook.com/${postId}`;
}

function extractTextsFromGraphqlBody(
  body: string,
  groupUrl: string,
): Array<{
  text: string;
  postId: string | null;
  permalink: string | null;
  authorName: string | null;
}> {
  const out: Array<{
    text: string;
    postId: string | null;
    permalink: string | null;
    authorName: string | null;
  }> = [];
  const re = /"text"\s*:\s*"((?:\\.|[^\\"]){30,800})"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const text = decodeJsonString(match[1]).replace(/\s+/g, ' ').trim();
    if (!isUsefulPostText(text)) continue;
    const identity = extractPostIdentityNear(body, match.index, groupUrl);
    const authorName = extractAuthorNear(body, match.index);
    out.push({
      text,
      postId: identity.postId,
      permalink: identity.permalink,
      authorName,
    });
  }
  return out;
}

export function attachFacebookGraphqlCapture(
  page: Page,
  options: { groupUrl?: string } = {},
): FacebookGraphqlCapture {
  const groupUrl = (options.groupUrl || page.url()).split('?')[0].replace(/\/$/, '');
  const seen = new Set<string>();
  const queue: GraphqlCapturedPost[] = [];
  let responsesSeen = 0;
  let textsSeen = 0;
  let postsKept = 0;
  let withPermalink = 0;

  const onResponse = async (res: Response) => {
    try {
      const url = res.url();
      if (!/graphql/i.test(url)) return;
      responsesSeen += 1;
      const body = await res.text();
      if (!body || body.length < 80) return;
      if (!/"text"\s*:/.test(body)) return;

      for (const item of extractTextsFromGraphqlBody(body, groupUrl)) {
        textsSeen += 1;
        const key = `${item.postId || ''}::${item.text.slice(0, 120)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Prefer posts with a resolvable permalink; keep text-only as group fallback
        // so we still create findings, but mark permalinkResolved=false for UI.
        const permalinkResolved = Boolean(item.permalink && item.postId);
        const canonicalUrl = permalinkResolved
          ? item.permalink!
          : groupUrl;

        postsKept += 1;
        if (permalinkResolved) withPermalink += 1;

        queue.push({
          externalId: item.postId,
          contentText: item.text,
          canonicalUrl,
          authorName: item.authorName,
          permalinkResolved,
        });
      }
    } catch {
      // Ignore closed-page / body read races.
    }
  };

  page.on('response', onResponse);

  return {
    drain() {
      if (!queue.length) return [];
      return queue.splice(0, queue.length);
    },
    stats() {
      return { responsesSeen, textsSeen, postsKept, withPermalink };
    },
    detach() {
      page.off('response', onResponse);
    },
  };
}

export function graphqlCaptureToFacebookPost(
  captured: GraphqlCapturedPost,
  groupUrl?: string | null,
): FacebookPostParsed {
  return applyFacebookPostIdentity(
    {
      externalId: captured.externalId,
      canonicalUrl: captured.canonicalUrl,
      authorName: captured.authorName,
      authorUrl: null,
      contentText: captured.contentText,
      publishedAt: null,
      publishedLabel: null,
      metrics: {},
      title: captured.contentText.slice(0, 100),
      isPinned: false,
      rawData: {
        parser: 'facebookGraphqlCapture@v3',
        source: 'graphql',
        permalinkResolved: captured.permalinkResolved,
      },
    },
    groupUrl,
  );
}
