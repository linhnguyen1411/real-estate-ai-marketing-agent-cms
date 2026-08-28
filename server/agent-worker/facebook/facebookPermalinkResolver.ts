/**
 * Resolve stable Facebook post identity for scan ingest + dedupe.
 * Prefer story permalink over photo/media links that open a lightbox only.
 */

import {
  canonicalizeFacebookPostUrl,
  parseFacebookContentUrl,
  resolveOpenableFacebookPostUrl,
} from '../../../shared/facebook-url';
import { buildContentDedupeMeta } from '../../agent/dedup/findingDedupService';
import type { FacebookPostParsed } from './facebookDomParser';

export function resolveFacebookScannedPostIdentity(input: {
  permalink?: string | null;
  externalId?: string | null;
  contentText: string;
  groupUrl?: string | null;
}): {
  canonicalUrl: string;
  externalId: string | null;
  /** Stable per-source dedupe key — body-based, not URL-based. */
  stableContentHash: string;
} {
  const groupUrl = input.groupUrl?.split('?')[0].replace(/\/$/, '') || null;
  const groupId = groupUrl ? parseFacebookContentUrl(groupUrl)?.groupId : null;

  const canonicalUrl =
    resolveOpenableFacebookPostUrl({
      candidates: [input.permalink],
      postId: input.externalId,
      groupId,
      groupUrl,
      externalId: input.externalId,
    }) ||
    canonicalizeFacebookPostUrl(input.permalink || '') ||
    String(input.permalink || '').trim();

  const parts = parseFacebookContentUrl(canonicalUrl);
  const externalId = parts?.postId || input.externalId || null;

  const meta = buildContentDedupeMeta(input.contentText);
  return {
    canonicalUrl,
    externalId,
    stableContentHash: meta.normalizedContentHash,
  };
}

export function applyFacebookPostIdentity(
  post: FacebookPostParsed,
  groupUrl?: string | null,
): FacebookPostParsed {
  const resolved = resolveFacebookScannedPostIdentity({
    permalink: post.canonicalUrl,
    externalId: post.externalId,
    contentText: post.contentText,
    groupUrl,
  });
  return {
    ...post,
    canonicalUrl: resolved.canonicalUrl,
    externalId: resolved.externalId,
  };
}
