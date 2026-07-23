/**
 * Link Normalization — strip tracking, unwrap Facebook redirects, extract ids.
 * Never hardcodes destination-specific CMS routes; only host/path rules.
 */

import type { NormalizedSocialLinks } from './types';

const TRACKING_PARAMS = new Set([
  'fbclid',
  'mibextid',
  '__tn__',
  '__cft__',
  '__xts__',
  'ref',
  'refid',
  'refsrc',
  'ref_type',
  'hc_ref',
  'hc_location',
  'sfnsn',
  'rdid',
  'share_url',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'eav',
  'paipv',
]);

const EPHEMERAL_HOST_MARKERS = [
  'lm.facebook.com',
  'l.facebook.com',
  'facebook.com/l.php',
];

const REJECT_PATH_MARKERS = [
  '/login',
  '/checkpoint',
  '/recover',
  '/sharer',
  '/dialog/',
  '/watch/',
];

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Temporary / non-permalink URLs must not be sent to Telegram. */
export function isEphemeralUrl(raw: string | null | undefined): boolean {
  const s = String(raw || '').trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  if (
    lower.startsWith('about:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('data:') ||
    lower.startsWith('chrome-') ||
    lower.includes('chrome-error')
  ) {
    return true;
  }
  if (!isHttpUrl(s)) return true;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    const path = `${u.pathname}${u.search}`.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (EPHEMERAL_HOST_MARKERS.some(m => lower.includes(m))) {
      // l.php / lm may wrap a real URL — not ephemeral if we can unwrap
      const uParam = u.searchParams.get('u');
      if (uParam) return false;
      return true;
    }
    if (REJECT_PATH_MARKERS.some(m => path.includes(m))) return true;
    return false;
  } catch {
    return true;
  }
}

function stripTracking(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.startsWith('__')) {
      url.searchParams.delete(key);
    }
  }
}

/** Unwrap Facebook redirect wrappers (l.php / lm.facebook.com). */
export function unwrapFacebookRedirect(raw: string): string {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase();
    if (
      host === 'l.facebook.com' ||
      host === 'lm.facebook.com' ||
      u.pathname.toLowerCase() === '/l.php'
    ) {
      const target = u.searchParams.get('u');
      if (target) {
        try {
          return decodeURIComponent(target);
        } catch {
          return target;
        }
      }
    }
  } catch {
    /* keep raw */
  }
  return raw.trim();
}

/**
 * Prefer www.facebook.com absolute https URLs (deep-link friendly).
 * Does not use window.location or JS navigation.
 */
export function toMobileFriendlyFacebookUrl(raw: string): string | null {
  if (isEphemeralUrl(raw)) return null;
  let current = unwrapFacebookRedirect(raw);
  try {
    const u = new URL(current);
    const host = u.hostname.toLowerCase().replace(/^m\./, 'www.');
    if (host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.watch')) {
      u.protocol = 'https:';
      u.hostname = host.startsWith('www.') || !host.endsWith('facebook.com')
        ? host.replace('fb.com', 'facebook.com')
        : `www.${host}`;
      if (u.hostname === 'facebook.com') u.hostname = 'www.facebook.com';
      stripTracking(u);
      u.hash = '';
      // Keep story_fbid / id / multi_permalinks query keys only
      const keep = new Set(['story_fbid', 'id', 'multi_permalinks', 'set']);
      for (const key of [...u.searchParams.keys()]) {
        if (!keep.has(key)) u.searchParams.delete(key);
      }
      let out = u.toString().replace(/\/$/, '');
      // Normalize /groups/{id}/permalink/{post}/ → posts form when possible
      return out;
    }
    stripTracking(u);
    u.hash = '';
    u.protocol = 'https:';
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function extractFacebookPostId(url: string | null | undefined): string | null {
  const s = String(url || '').trim();
  if (!s) return null;
  try {
    const u = new URL(unwrapFacebookRedirect(s));
    const story = u.searchParams.get('story_fbid') || u.searchParams.get('multi_permalinks');
    if (story) return story.replace(/\D/g, '') || story;
    const id = u.searchParams.get('fbid') || u.searchParams.get('id');
    const path = u.pathname;
    const posts = path.match(/\/posts\/(?:pfbid[\w]+|\d+)/i);
    if (posts) return posts[0].split('/').pop() || null;
    const permalink = path.match(/\/permalink\/(\d+)/i);
    if (permalink) return permalink[1];
    const photo = path.match(/\/photos\/(?:a\.\d+\/)?(\d+)/i);
    if (photo) return photo[1];
    if (id && /permalink|story\.php|photo\.php/i.test(path + u.search)) {
      return id.replace(/\D/g, '') || id;
    }
    return null;
  } catch {
    return null;
  }
}

export function extractFacebookGroupId(url: string | null | undefined): string | null {
  const s = String(url || '').trim();
  if (!s) return null;
  try {
    const u = new URL(unwrapFacebookRedirect(s));
    const m = u.pathname.match(/\/groups\/([^/]+)/i);
    if (!m) return null;
    const slug = decodeURIComponent(m[1]);
    return slug || null;
  } catch {
    return null;
  }
}

/** Build stable group URL from id/slug. */
export function buildGroupUrl(groupId: string | null | undefined): string | null {
  const id = String(groupId || '').trim();
  if (!id) return null;
  return `https://www.facebook.com/groups/${encodeURIComponent(id)}`;
}

/** Build stable post permalink when ids known. */
export function buildPostPermalink(input: {
  postId?: string | null;
  groupId?: string | null;
  postUrl?: string | null;
}): string | null {
  if (input.postUrl) {
    const mobile = toMobileFriendlyFacebookUrl(input.postUrl);
    if (mobile) return mobile;
  }
  const postId = String(input.postId || '').trim();
  const groupId = String(input.groupId || '').trim();
  if (postId && groupId) {
    if (postId.startsWith('pfbid')) {
      return `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/posts/${postId}`;
    }
    return `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/posts/${postId}`;
  }
  if (postId) {
    return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(postId)}`;
  }
  return null;
}

export function normalizeSocialLinks(input: {
  postUrl?: string | null;
  groupUrl?: string | null;
  postId?: string | null;
  groupId?: string | null;
  canonicalUrl?: string | null;
  publishedUrl?: string | null;
}): NormalizedSocialLinks {
  const rejected: string[] = [];
  const rawPost =
    String(input.postUrl || input.canonicalUrl || input.publishedUrl || '').trim() || null;
  const rawGroup = String(input.groupUrl || '').trim() || null;

  let postUrl: string | null = null;
  let groupUrl: string | null = null;

  if (rawPost) {
    postUrl = toMobileFriendlyFacebookUrl(rawPost);
    if (!postUrl) rejected.push(rawPost);
  }
  if (rawGroup) {
    groupUrl =
      toMobileFriendlyFacebookUrl(rawGroup) ||
      buildGroupUrl(extractFacebookGroupId(rawGroup));
    if (!groupUrl) rejected.push(rawGroup);
  }

  const postId =
    String(input.postId || '').trim() ||
    extractFacebookPostId(postUrl) ||
    extractFacebookPostId(rawPost) ||
    null;
  const groupId =
    String(input.groupId || '').trim() ||
    extractFacebookGroupId(postUrl) ||
    extractFacebookGroupId(groupUrl) ||
    extractFacebookGroupId(rawGroup) ||
    extractFacebookGroupId(rawPost) ||
    null;

  if (!postUrl && postId) {
    postUrl = buildPostPermalink({ postId, groupId });
  }
  if (!groupUrl && groupId) {
    groupUrl = buildGroupUrl(groupId);
  }

  const canonicalUrl = postUrl || groupUrl || null;

  return {
    rawPostUrl: rawPost,
    rawGroupUrl: rawGroup,
    postUrl,
    groupUrl,
    postId,
    groupId,
    canonicalUrl,
    rejected,
  };
}
