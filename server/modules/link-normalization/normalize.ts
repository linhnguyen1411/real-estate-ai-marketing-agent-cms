/**
 * Link Normalization — strip tracking, unwrap Facebook redirects, extract ids.
 * Facebook post URL SSOT: shared/facebook-url (parse → rebuild).
 * Never hardcodes destination-specific CMS routes; only host/path rules.
 */

import {
  canonicalizeFacebookPostUrl,
  isSolidFacebookPostUrl,
  parseFacebookContentUrl,
  resolveOpenableFacebookPostUrl,
  unwrapFacebookRedirect as unwrapShared,
  asFacebookId,
} from '../../../shared/facebook-url';
import type { NormalizedSocialLinks } from './types';

export {
  canonicalizeFacebookPostUrl,
  isSolidFacebookPostUrl,
  resolveOpenableFacebookPostUrl,
  parseFacebookContentUrl,
} from '../../../shared/facebook-url';

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
];

/** Login walls / checkpoints — never use as Telegram Source button. */
export function isDegradedFacebookUrl(raw: string | null | undefined): boolean {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return true;
  if (isEphemeralUrl(raw)) return true;
  if (REJECT_PATH_MARKERS.some(m => s.includes(m))) return true;
  if (/facebook\.com\/+login/i.test(s)) return true;
  return false;
}

/**
 * Real content permalink shape (post/photo/reel) — safe to send to Telegram as-is.
 * Delegates to SSOT isSolidFacebookPostUrl.
 */
export function isSolidFacebookPermalink(raw: string | null | undefined): boolean {
  const s = String(raw || '').trim();
  if (!s || !/^https:\/\//i.test(s)) return false;
  if (isDegradedFacebookUrl(s)) return false;
  return isSolidFacebookPostUrl(s);
}

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

/** Unwrap Facebook redirect wrappers (l.php / lm.facebook.com). */
export function unwrapFacebookRedirect(raw: string): string {
  return unwrapShared(raw);
}

/**
 * Prefer www.facebook.com absolute https URLs (deep-link friendly).
 * Delegates Facebook content URLs to SSOT canonicalizeFacebookPostUrl.
 */
export function toMobileFriendlyFacebookUrl(raw: string): string | null {
  if (isEphemeralUrl(raw)) return null;
  const canonical = canonicalizeFacebookPostUrl(raw);
  if (canonical) return canonical;

  // Non-post Facebook URLs (group home) — cleaned host only, for group button
  try {
    const current = unwrapFacebookRedirect(raw);
    const u = new URL(current);
    const host = u.hostname.toLowerCase().replace(/^m\./, 'www.');
    if (!(host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.watch'))) {
      return null;
    }
    u.protocol = 'https:';
    if (host === 'fb.com' || host === 'www.fb.com') u.hostname = 'www.facebook.com';
    else if (host === 'facebook.com') u.hostname = 'www.facebook.com';
    else u.hostname = host.startsWith('www.') ? host : `www.${host.replace(/^www\./, '')}`;
    if (!u.hostname.includes('facebook.com')) u.hostname = 'www.facebook.com';
    u.hash = '';
    const pathNoSlash = u.pathname.replace(/\/+$/, '');
    if (/^\/groups\/[^/]+$/i.test(pathNoSlash)) {
      u.pathname = pathNoSlash;
      u.search = '';
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function extractFacebookPostId(url: string | null | undefined): string | null {
  const parts = parseFacebookContentUrl(url);
  return asFacebookId(parts?.postId || parts?.mediaId) || null;
}

export function extractFacebookGroupId(url: string | null | undefined): string | null {
  const parts = parseFacebookContentUrl(url);
  if (parts?.groupId) return parts.groupId;
  const s = String(url || '').trim();
  if (!s) return null;
  try {
    const u = new URL(unwrapFacebookRedirect(s));
    const m = u.pathname.match(/\/groups\/([^/]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
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

/** Build stable post permalink when ids known — SSOT rebuild. */
export function buildPostPermalink(input: {
  postId?: string | null;
  groupId?: string | null;
  postUrl?: string | null;
}): string | null {
  if (input.postUrl) {
    const canon = canonicalizeFacebookPostUrl(input.postUrl);
    if (canon) return canon;
  }
  return resolveOpenableFacebookPostUrl({
    postId: input.postId,
    groupId: input.groupId,
  });
}

export function normalizeSocialLinks(input: {
  postUrl?: string | null;
  groupUrl?: string | null;
  postId?: string | null;
  groupId?: string | null;
  canonicalUrl?: string | null;
  publishedUrl?: string | null;
  externalId?: string | null;
}): NormalizedSocialLinks {
  const rejected: string[] = [];
  const rawPost =
    String(input.postUrl || input.canonicalUrl || input.publishedUrl || '').trim() || null;
  const rawGroup = String(input.groupUrl || '').trim() || null;

  const postUrl = resolveOpenableFacebookPostUrl({
    candidates: [input.postUrl, input.canonicalUrl, input.publishedUrl],
    postId: input.postId,
    groupId: input.groupId,
    groupUrl: input.groupUrl,
    externalId: input.externalId,
  });

  if (rawPost && !postUrl) rejected.push(rawPost);

  let groupUrl: string | null = null;
  if (rawGroup) {
    groupUrl = buildGroupUrl(extractFacebookGroupId(rawGroup)) || toMobileFriendlyFacebookUrl(rawGroup);
    if (!groupUrl) rejected.push(rawGroup);
  }

  const postId =
    asFacebookId(input.postId) ||
    extractFacebookPostId(postUrl) ||
    extractFacebookPostId(rawPost) ||
    asFacebookId(input.externalId) ||
    null;
  const groupId =
    String(input.groupId || '').trim() ||
    extractFacebookGroupId(postUrl) ||
    extractFacebookGroupId(groupUrl) ||
    extractFacebookGroupId(rawGroup) ||
    extractFacebookGroupId(rawPost) ||
    null;

  if (!groupUrl && groupId) {
    groupUrl = buildGroupUrl(groupId);
  }

  // canonicalUrl for open-post = post only (never group-home as post SSOT)
  const canonicalUrl = postUrl || null;

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
