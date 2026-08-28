import type { ScannedContent } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import type { FacebookPostParsed } from '../facebook/facebookDomParser';
import { resolveFacebookScannedPostIdentity } from '../facebook/facebookPermalinkResolver';
import {
  buildRawMetadata,
  computeContentHash,
  normalizeCanonicalUrl,
  normalizeText,
  sanitizeJsonValue,
  sanitizeUnicodeString,
} from './contentNormalizer';
import { extractLeadData, toRawExtracted } from '../../agent/extractors';
import {
  buildContentDedupeMeta,
  findExistingScannedContentDuplicate,
} from '../../agent/dedup/findingDedupService';
import { enqueueScannedContentSync, shouldEnqueueSync } from '../../agentSync/enqueue';

export interface SaveContentInput {
  companyId: string | null;
  sourceId: string;
  parsed: import('./contentNormalizer').ParsedPageContent;
  maxContentChars: number;
}

export interface SaveContentResult {
  record: ScannedContent;
  inserted: boolean;
}

export async function saveScannedContent(input: SaveContentInput): Promise<SaveContentResult | null> {
  const canonicalUrl = normalizeCanonicalUrl(input.parsed.canonicalUrl);
  const bodyText = normalizeText(input.parsed.bodyText, input.maxContentChars);

  if (!bodyText || bodyText.length < 40) {
    return null;
  }

  const contentHash = computeContentHash(canonicalUrl, bodyText);
  const publishedAt = parsePublishedAt(input.parsed.publishedAt);
  const dedupeMeta = buildContentDedupeMeta(bodyText, input.parsed.title);

  const existing = await prisma.scannedContent.findUnique({
    where: {
      sourceId_contentHash: {
        sourceId: input.sourceId,
        contentHash,
      },
    },
  });

  const rawData = sanitizeJsonValue(
    buildRawMetadata({
      title: input.parsed.title,
      canonicalUrl,
      linkCount: input.parsed.links.length,
      publishedAt: input.parsed.publishedAt,
      excerpt: bodyText.slice(0, 300),
    }),
  );

  const record = await prisma.scannedContent.upsert({
    where: {
      sourceId_contentHash: {
        sourceId: input.sourceId,
        contentHash,
      },
    },
    create: {
      companyId: input.companyId,
      sourceId: input.sourceId,
      canonicalUrl,
      contentText: bodyText,
      contentHash,
      normalizedContentHash: dedupeMeta.normalizedContentHash,
      nearDuplicateFingerprint: dedupeMeta.nearDuplicateFingerprint,
      dedupeVersion: dedupeMeta.dedupeVersion,
      publishedAt,
      rawData: rawData as Prisma.InputJsonValue,
      status: 'collected',
      ...(shouldEnqueueSync() ? { syncStatus: 'pending' } : {}),
    },
    update: {
      canonicalUrl,
      contentText: bodyText,
      normalizedContentHash: dedupeMeta.normalizedContentHash,
      nearDuplicateFingerprint: dedupeMeta.nearDuplicateFingerprint,
      dedupeVersion: dedupeMeta.dedupeVersion,
      publishedAt,
      collectedAt: new Date(),
      rawData: rawData as Prisma.InputJsonValue,
      status: 'collected',
      ...(shouldEnqueueSync() ? { syncStatus: 'pending', syncError: null } : {}),
    },
  });

  if (shouldEnqueueSync()) {
    await enqueueScannedContentSync({ scannedContentId: record.id });
  }

  return { record, inserted: !existing };
}

export type FacebookDedupeHit = {
  record: ScannedContent;
  match: 'externalId' | 'canonicalUrl' | 'contentHash' | 'normalized_hash';
};

/**
 * Dedup priority: externalId > canonicalUrl > normalized hash > contentHash.
 */
export async function findExistingFacebookPost(
  sourceId: string,
  post: Pick<FacebookPostParsed, 'externalId' | 'canonicalUrl' | 'contentText'>,
): Promise<ScannedContent | null> {
  const hit = await findExistingFacebookPostDetailed(sourceId, post);
  return hit?.record ?? null;
}

export async function findExistingFacebookPostDetailed(
  sourceId: string,
  post: Pick<FacebookPostParsed, 'externalId' | 'canonicalUrl' | 'contentText'>,
): Promise<FacebookDedupeHit | null> {
  const layered = await findExistingScannedContentDuplicate({
    sourceId,
    externalId: post.externalId,
    canonicalUrl: post.canonicalUrl,
    contentText: post.contentText,
  });
  if (layered) {
    const match =
      layered.reason === 'external_id'
        ? 'externalId'
        : layered.reason === 'canonical_url'
          ? 'canonicalUrl'
          : 'normalized_hash';
    return { record: layered.record, match };
  }

  const bodyText = normalizeText(post.contentText);
  const contentHash = computeContentHash(post.canonicalUrl, bodyText);
  const byHash = await prisma.scannedContent.findUnique({
    where: {
      sourceId_contentHash: { sourceId, contentHash },
    },
  });
  if (byHash) return { record: byHash, match: 'contentHash' };
  return null;
}

export async function saveFacebookScannedPost(input: {
  companyId: string | null;
  sourceId: string;
  post: FacebookPostParsed;
  maxContentChars: number;
  groupUrl?: string | null;
}): Promise<SaveContentResult | null> {
  const bodyText = normalizeText(input.post.contentText, input.maxContentChars);
  if (!bodyText || bodyText.length < 15) return null;

  const identity = resolveFacebookScannedPostIdentity({
    permalink: input.post.canonicalUrl,
    externalId: input.post.externalId,
    contentText: bodyText,
    groupUrl: input.groupUrl,
  });
  const canonicalUrl = identity.canonicalUrl;
  const externalId = identity.externalId;
  // Body-based hash — URL changes (photo fbid vs story id) must not create twins.
  const contentHash = identity.stableContentHash;
  const publishedAt = parsePublishedAt(input.post.publishedAt);
  const dedupeMeta = buildContentDedupeMeta(bodyText);

  const authorName = input.post.authorName
    ? sanitizeUnicodeString(input.post.authorName)
    : null;
  const authorUrl = input.post.authorUrl
    ? sanitizeUnicodeString(input.post.authorUrl)
    : null;
  const publishedLabel = input.post.publishedLabel
    ? sanitizeUnicodeString(input.post.publishedLabel)
    : null;

  const existing = await findExistingFacebookPost(input.sourceId, {
    externalId,
    canonicalUrl,
    contentText: bodyText,
  });

  // If layered dedupe hit a different hash row, update that row instead of inserting a twin.
  if (existing && existing.contentHash !== contentHash) {
    const extracted = toRawExtracted(extractLeadData(bodyText)) as unknown as Prisma.InputJsonValue;
    const rawData = sanitizeJsonValue({
      ...input.post.rawData,
      platform: 'facebook',
      authorName,
      authorUrl,
      publishedLabel,
      metrics: input.post.metrics,
      excerpt: bodyText.slice(0, 300),
      extracted,
    });
    const record = await prisma.scannedContent.update({
      where: { id: existing.id },
      data: {
        externalId: externalId ?? undefined,
        canonicalUrl,
        authorName,
        authorUrl,
        contentText: bodyText,
        contentHash,
        normalizedContentHash: dedupeMeta.normalizedContentHash,
        nearDuplicateFingerprint: dedupeMeta.nearDuplicateFingerprint,
        dedupeVersion: dedupeMeta.dedupeVersion,
        publishedAt,
        collectedAt: new Date(),
        rawData: rawData as Prisma.InputJsonValue,
        status: 'collected',
        ...(shouldEnqueueSync() ? { syncStatus: 'pending', syncError: null } : {}),
      },
    });
    if (shouldEnqueueSync()) {
      await enqueueScannedContentSync({ scannedContentId: record.id });
    }
    return { record, inserted: false };
  }

  const extracted = toRawExtracted(extractLeadData(bodyText)) as unknown as Prisma.InputJsonValue;

  const rawData = sanitizeJsonValue({
    ...input.post.rawData,
    platform: 'facebook',
    authorName,
    authorUrl,
    publishedLabel,
    metrics: input.post.metrics,
    excerpt: bodyText.slice(0, 300),
    extracted,
  });

  const record = await prisma.scannedContent.upsert({
    where: {
      sourceId_contentHash: {
        sourceId: input.sourceId,
        contentHash,
      },
    },
    create: {
      companyId: input.companyId,
      sourceId: input.sourceId,
      externalId,
      canonicalUrl,
      authorName,
      authorUrl,
      contentText: bodyText,
      contentHash,
      normalizedContentHash: dedupeMeta.normalizedContentHash,
      nearDuplicateFingerprint: dedupeMeta.nearDuplicateFingerprint,
      dedupeVersion: dedupeMeta.dedupeVersion,
      publishedAt,
      rawData: rawData as Prisma.InputJsonValue,
      status: 'collected',
      ...(shouldEnqueueSync() ? { syncStatus: 'pending' } : {}),
    },
    update: {
      externalId: input.post.externalId ?? undefined,
      canonicalUrl,
      authorName,
      authorUrl,
      contentText: bodyText,
      normalizedContentHash: dedupeMeta.normalizedContentHash,
      nearDuplicateFingerprint: dedupeMeta.nearDuplicateFingerprint,
      dedupeVersion: dedupeMeta.dedupeVersion,
      publishedAt,
      collectedAt: new Date(),
      rawData: rawData as Prisma.InputJsonValue,
      status: 'collected',
      ...(shouldEnqueueSync() ? { syncStatus: 'pending', syncError: null } : {}),
    },
  });

  if (shouldEnqueueSync()) {
    await enqueueScannedContentSync({ scannedContentId: record.id });
  }

  return { record, inserted: !existing };
}

function parsePublishedAt(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
