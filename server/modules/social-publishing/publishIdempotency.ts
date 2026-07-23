/**
 * Exactly-once helpers for SocialPublishJob — never republish after a successful click.
 */

import { createHash } from 'node:crypto';
import { markdownToFacebookText } from './browser/dom/facebookText';

export type PublishOutcome = 'pending' | 'published' | 'unknown' | 'failed';

export function normalizeCaptionForHash(input: string): string {
  return markdownToFacebookText(input)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function captionHash(input: string): string {
  return createHash('sha256').update(normalizeCaptionForHash(input), 'utf8').digest('hex');
}

export function captionSnippet(input: string, maxLen = 48): string {
  const n = normalizeCaptionForHash(input);
  return n.slice(0, Math.max(12, Math.min(maxLen, n.length)));
}

/** Strip bare http(s) URLs from caption body (media_first policy). */
export function stripUrlsFromCaption(body: string): string {
  return String(body || '')
    .replace(/https?:\/\/[^\s<>"')\]]+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function resolvePublishMode(destinationConfig?: Record<string, unknown> | null): 'media_first' | 'legacy' {
  const raw = String(destinationConfig?.publishMode || process.env.SOCIAL_PUBLISH_MODE || 'media_first')
    .trim()
    .toLowerCase();
  return raw === 'legacy' ? 'legacy' : 'media_first';
}

/**
 * Caption + optional link for the composer.
 * media_first + media present → never put URL in caption (avoids FB link-preview stealing the image).
 */
export function resolveComposerCaption(input: {
  body: string;
  linkUrl?: string | null;
  mediaCount: number;
  publishMode?: 'media_first' | 'legacy';
}): {
  caption: string;
  linkDeferred: boolean;
  deferredLinkUrl: string | null;
  mode: 'media_first' | 'legacy';
} {
  const mode = input.publishMode || 'media_first';
  const plain = markdownToFacebookText(input.body);
  const link = input.linkUrl?.trim() || null;

  if (mode === 'media_first' && input.mediaCount > 0) {
    return {
      caption: stripUrlsFromCaption(plain),
      linkDeferred: Boolean(link),
      deferredLinkUrl: link,
      mode,
    };
  }

  const caption = link ? `${plain}\n${link}` : plain;
  return { caption, linkDeferred: false, deferredLinkUrl: null, mode };
}

export function readPublishResult(result: unknown): Record<string, unknown> {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return {};
}

/** Synthetic IDs invented by CMS/agent — never real Facebook permalinks. */
export function isSyntheticExternalPostId(id: string): boolean {
  const s = String(id || '').trim();
  if (!s) return true;
  return (
    s.startsWith('agent:') ||
    s.startsWith('dry_run_') ||
    s.startsWith('browser_') ||
    s.startsWith('stub_')
  );
}

/** True only for IDs that can safely become facebook.com/{id} links. */
export function isUsableFacebookPostId(id: string): boolean {
  const s = String(id || '').trim();
  if (!s || isSyntheticExternalPostId(s)) return false;
  // Graph-style "pageId_postId" or numeric / pfbid
  return /^[\w.-]+$/.test(s) && !s.includes(':');
}

export function hasExternalPostMarker(result: unknown): boolean {
  const r = readPublishResult(result);
  const idOk = (v: unknown) =>
    typeof v === 'string' && v.trim() && !isSyntheticExternalPostId(v);
  return Boolean(
    idOk(r.externalPostId) ||
      idOk(r.facebookPostId) ||
      (typeof r.externalUrl === 'string' && r.externalUrl.trim()) ||
      (typeof r.facebookPostUrl === 'string' && r.facebookPostUrl.trim()) ||
      (typeof r.permalink === 'string' && r.permalink.trim()),
  );
}

export function wasPublishClicked(result: unknown): boolean {
  const r = readPublishResult(result);
  return r.publishClicked === true || r.publishOutcome === 'published' || r.publishOutcome === 'unknown';
}

export function isTerminalPublishOutcome(result: unknown): boolean {
  const r = readPublishResult(result);
  const outcome = String(r.publishOutcome || '');
  return (
    outcome === 'published' ||
    outcome === 'unknown' ||
    r.verified === true ||
    hasExternalPostMarker(r) ||
    wasPublishClicked(r)
  );
}

/** Pure: retry / reclaim must not create a second Facebook post. */
export function shouldSkipRetry(job: {
  status: string;
  result?: unknown;
}): { skip: boolean; reason?: 'already_published' | 'verify_unknown' | 'publish_clicked' } {
  if (job.status === 'published') {
    return { skip: true, reason: 'already_published' };
  }
  const r = readPublishResult(job.result);
  if (hasExternalPostMarker(r) || r.verified === true || r.publishOutcome === 'published') {
    return { skip: true, reason: 'already_published' };
  }
  if (r.publishOutcome === 'unknown') {
    return { skip: true, reason: 'verify_unknown' };
  }
  if (r.publishClicked === true) {
    return { skip: true, reason: 'publish_clicked' };
  }
  return { skip: false };
}

export function feedLooksAlreadyPublished(feedText: string, body: string): boolean {
  // Longer snippet reduces false matches against short UI chrome on the group page.
  const snippet = captionSnippet(body, 72);
  if (snippet.length < 24) return false;
  const hay = normalizeCaptionForHash(feedText);
  return hay.includes(snippet);
}

/**
 * Read visible page text for anti-dupe / verify, excluding open composer dialogs.
 * Without this, caption just typed into the composer is always "already on the feed".
 */
export async function readFeedTextExcludingDialogs(page: {
  evaluate: (fn: () => string) => Promise<string>;
}): Promise<string> {
  try {
    return await page.evaluate(() => {
      const root = document.body;
      if (!root) return '';
      const clone = root.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll('[role="dialog"], [aria-modal="true"], [data-testid="composer"]')
        .forEach((node) => node.remove());
      return String(clone.innerText || '').slice(0, 16_000);
    });
  } catch {
    return '';
  }
}
