/**
 * SSOT — Canonical Facebook post URL (pure; no DB / browser / React).
 *
 * Owner of openable post permalink shape for Lead / Telegram / Executive / UI.
 * Parse → rebuild. Never Number()-cast Facebook ids (precision loss).
 */

export type FacebookContentKind =
  | 'group_post'
  | 'permalink_php'
  | 'photo'
  | 'video'
  | 'reel'
  | 'story'
  | 'group_home'
  | 'unknown';

export type FacebookUrlParts = {
  kind: FacebookContentKind;
  groupId: string | null;
  postId: string | null;
  /** Preserved photo/video path segment when specialized */
  mediaId: string | null;
  raw: string;
};

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

const KEEP_QUERY = new Set(['story_fbid', 'id', 'multi_permalinks', 'set', 'fbid', 'v']);

const REJECT_MARKERS = ['/login', '/checkpoint', '/recover', '/sharer', '/dialog/'];

function isFacebookHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^m\./, '').replace(/^www\./, '');
  return h === 'facebook.com' || h === 'fb.com' || h === 'fb.watch';
}

/** Keep ids as strings — never Number() (17-digit FB ids exceed MAX_SAFE_INTEGER). */
export function asFacebookId(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^pfbid[\w]+$/i.test(s)) return s;
  if (/^\d{5,}$/.test(s)) return s;
  return null;
}

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

function stripTracking(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower) || lower.startsWith('__')) {
      url.searchParams.delete(key);
    }
  }
}

function forceWwwFacebookHost(url: URL): void {
  let host = url.hostname.toLowerCase().replace(/^m\./, 'www.');
  if (host === 'fb.com' || host === 'www.fb.com') host = 'www.facebook.com';
  if (host === 'facebook.com') host = 'www.facebook.com';
  if (host.endsWith('.facebook.com') && !host.startsWith('www.')) {
    host = 'www.facebook.com';
  }
  url.protocol = 'https:';
  url.hostname = host;
  url.hash = '';
}

function isRejectedPath(url: URL): boolean {
  const path = `${url.pathname}${url.search}`.toLowerCase();
  return REJECT_MARKERS.some(m => path.includes(m));
}

/**
 * Parse any accepted Facebook content URL into structured parts.
 */
export function parseFacebookContentUrl(raw: string | null | undefined): FacebookUrlParts | null {
  const input = String(raw || '').trim();
  if (!input) return null;
  let current = unwrapFacebookRedirect(input);
  if (!/^https?:\/\//i.test(current) && current.startsWith('/')) {
    current = `https://www.facebook.com${current}`;
  }
  let u: URL;
  try {
    u = new URL(current);
  } catch {
    return null;
  }
  if (!isFacebookHost(u.hostname)) return null;
  if (isRejectedPath(u)) return null;

  const path = u.pathname;
  const pathNoSlash = path.replace(/\/+$/, '') || '/';
  const storyFbid = asFacebookId(
    u.searchParams.get('story_fbid') || u.searchParams.get('multi_permalinks'),
  );
  const queryId = asFacebookId(u.searchParams.get('id'));
  const fbid = asFacebookId(u.searchParams.get('fbid'));
  const groupMatch = path.match(/\/groups\/([^/]+)/i);
  const groupId = groupMatch ? decodeURIComponent(groupMatch[1]) : null;

  const postsMatch = path.match(/\/posts\/(pfbid[\w]+|\d+)/i);
  if (postsMatch) {
    return {
      kind: 'group_post',
      groupId,
      postId: postsMatch[1],
      mediaId: null,
      raw: input,
    };
  }

  const permalinkPath = path.match(/\/permalink\/(\d+)/i);
  if (permalinkPath) {
    return {
      kind: 'group_post',
      groupId,
      postId: permalinkPath[1],
      mediaId: null,
      raw: input,
    };
  }

  if (/permalink\.php/i.test(path) && storyFbid) {
    return {
      kind: 'permalink_php',
      groupId: groupId || queryId,
      postId: storyFbid,
      mediaId: null,
      raw: input,
    };
  }

  if (/story\.php/i.test(path) && storyFbid) {
    return {
      kind: 'story',
      groupId: groupId || queryId,
      postId: storyFbid,
      mediaId: null,
      raw: input,
    };
  }

  const photoPath = path.match(/\/photos\/(?:[^/]+\/)?(\d{8,})/i);
  if (photoPath || (/photo\.php/i.test(path) && fbid)) {
    return {
      kind: 'photo',
      groupId,
      postId: photoPath?.[1] || fbid,
      mediaId: photoPath?.[1] || fbid,
      raw: input,
    };
  }

  const videoPath = path.match(/\/videos\/(\d+)/i);
  const watchV = asFacebookId(u.searchParams.get('v'));
  if (videoPath || (/\/watch/i.test(path) && watchV)) {
    return {
      kind: 'video',
      groupId,
      postId: videoPath?.[1] || watchV,
      mediaId: videoPath?.[1] || watchV,
      raw: input,
    };
  }

  const reelPath = path.match(/\/reel\/(\w+)/i);
  if (reelPath) {
    return {
      kind: 'reel',
      groupId,
      postId: reelPath[1],
      mediaId: reelPath[1],
      raw: input,
    };
  }

  if (groupId && /^\/groups\/[^/]+$/i.test(pathNoSlash)) {
    return { kind: 'group_home', groupId, postId: null, mediaId: null, raw: input };
  }

  return {
    kind: 'unknown',
    groupId,
    postId: storyFbid || fbid || queryId,
    mediaId: null,
    raw: input,
  };
}

/**
 * Rebuild one canonical openable Facebook content URL from parts.
 */
export function buildCanonicalFacebookPostUrl(parts: FacebookUrlParts): string | null {
  const postId = asFacebookId(parts.postId);
  const groupId = parts.groupId ? String(parts.groupId).trim() : null;
  const mediaId = asFacebookId(parts.mediaId);

  if (parts.kind === 'group_home') return null;

  if (parts.kind === 'photo' && mediaId) {
    if (groupId) {
      return `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/permalink/${mediaId}`;
    }
    return `https://www.facebook.com/photo.php?fbid=${encodeURIComponent(mediaId)}`;
  }

  if (parts.kind === 'video' && mediaId) {
    return `https://www.facebook.com/watch/?v=${encodeURIComponent(mediaId)}`;
  }

  if (parts.kind === 'reel' && mediaId) {
    return `https://www.facebook.com/reel/${encodeURIComponent(mediaId)}`;
  }

  if (!postId) return null;

  if (groupId) {
    return `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/posts/${postId}`;
  }

  return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(postId)}`;
}

/**
 * Canonicalize a single raw URL into the SSOT openable form.
 * Returns null for group-home / login / ephemeral / non-facebook.
 */
export function canonicalizeFacebookPostUrl(raw: string | null | undefined): string | null {
  const parts = parseFacebookContentUrl(raw);
  if (!parts) return null;
  if (parts.kind === 'group_home') return null;

  const built = buildCanonicalFacebookPostUrl(parts);
  if (built) return built;

  try {
    const u = new URL(unwrapFacebookRedirect(String(raw)));
    if (!isFacebookHost(u.hostname) || isRejectedPath(u)) return null;
    forceWwwFacebookHost(u);
    stripTracking(u);
    for (const key of [...u.searchParams.keys()]) {
      if (!KEEP_QUERY.has(key)) u.searchParams.delete(key);
    }
    const pathNoSlash = u.pathname.replace(/\/+$/, '');
    if (/^\/groups\/[^/]+$/i.test(pathNoSlash)) return null;
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** True when URL is a real content permalink (not group home / login). */
export function isSolidFacebookPostUrl(raw: string | null | undefined): boolean {
  const canonical = canonicalizeFacebookPostUrl(raw);
  if (!canonical) return false;
  const parts = parseFacebookContentUrl(canonical);
  if (!parts || parts.kind === 'group_home') return false;
  if (parts.postId || parts.mediaId) return true;
  return /permalink\.php|\/posts\/|\/permalink\/|\/photos\/|photo\.php|\/videos\/|\/watch|\/reel\//i.test(
    canonical,
  );
}

/**
 * Resolve best openable post URL with backward-compatible fallback chain:
 * candidates → rebuild(postId+groupId) → externalId+group → null
 *
 * Never returns group-home as a post open URL.
 */
export function resolveOpenableFacebookPostUrl(input: {
  candidates?: Array<string | null | undefined>;
  postId?: string | null;
  groupId?: string | null;
  groupUrl?: string | null;
  externalId?: string | null;
}): string | null {
  const tried: string[] = [];

  for (const c of input.candidates || []) {
    const canon = canonicalizeFacebookPostUrl(c);
    if (canon && isSolidFacebookPostUrl(canon)) return canon;
    if (c) tried.push(String(c));
  }

  let groupId = asFacebookId(input.groupId);
  if (!groupId && input.groupUrl) {
    groupId = parseFacebookContentUrl(input.groupUrl)?.groupId || null;
  }
  // Slug group ids are not always numeric
  if (!groupId && input.groupUrl) {
    const m = String(input.groupUrl).match(/\/groups\/([^/?#]+)/i);
    if (m) groupId = decodeURIComponent(m[1]);
  }

  const postId = asFacebookId(input.postId) || asFacebookId(input.externalId);
  if (postId) {
    const rebuilt = buildCanonicalFacebookPostUrl({
      kind: groupId ? 'group_post' : 'permalink_php',
      groupId,
      postId,
      mediaId: null,
      raw: '',
    });
    if (rebuilt) return rebuilt;
  }

  for (const c of tried) {
    const parts = parseFacebookContentUrl(c);
    if (parts?.postId) {
      const rebuilt = buildCanonicalFacebookPostUrl({
        ...parts,
        groupId: parts.groupId || groupId,
      });
      if (rebuilt) return rebuilt;
    }
  }

  return null;
}
