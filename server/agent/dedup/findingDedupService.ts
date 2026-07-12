/**
 * Finding / content multi-layer dedupe for Lead Intelligence.
 */

import type { AgentFinding, ScannedContent } from '@prisma/client';
import { prisma } from '../../prisma';
import {
  CONTENT_DEDUPE_VERSION,
  hashNormalizedContent,
  normalizeLeadContent,
} from './contentNormalizer';
import {
  computeNearDuplicateFingerprint,
  hammingSimilarity,
} from './contentFingerprint';

export type DedupeStatus = 'unique' | 'duplicate' | 'possible_duplicate';

export interface ContentDedupeMeta {
  normalizedContent: string;
  normalizedContentHash: string;
  nearDuplicateFingerprint: string;
  dedupeVersion: string;
}

export interface FindingDedupeDecision {
  status: DedupeStatus;
  duplicateOfFindingId: string | null;
  similarityScore: number | null;
  reason: string | null;
}

export const NEAR_DUPLICATE_THRESHOLD = 0.9;
export const POSSIBLE_DUPLICATE_THRESHOLD = 0.82;

export function buildContentDedupeMeta(
  contentText: string,
  title?: string | null,
): ContentDedupeMeta {
  const normalizedContent = normalizeLeadContent(contentText, title);
  return {
    normalizedContent,
    normalizedContentHash: hashNormalizedContent(normalizedContent),
    nearDuplicateFingerprint: computeNearDuplicateFingerprint(normalizedContent),
    dedupeVersion: CONTENT_DEDUPE_VERSION,
  };
}

export async function findExistingScannedContentDuplicate(input: {
  sourceId: string;
  externalId?: string | null;
  canonicalUrl?: string | null;
  contentText: string;
  title?: string | null;
}): Promise<{ record: ScannedContent; reason: string } | null> {
  if (input.externalId) {
    const byExt = await prisma.scannedContent.findFirst({
      where: { sourceId: input.sourceId, externalId: input.externalId },
      orderBy: { collectedAt: 'desc' },
    });
    if (byExt) return { record: byExt, reason: 'external_id' };
  }

  if (input.canonicalUrl && /\/posts\/\d+/.test(input.canonicalUrl)) {
    const urlBase = input.canonicalUrl.split('?')[0].replace(/\/$/, '');
    const byUrl = await prisma.scannedContent.findFirst({
      where: {
        sourceId: input.sourceId,
        OR: [
          { canonicalUrl: input.canonicalUrl },
          { canonicalUrl: { startsWith: urlBase } },
        ],
      },
      orderBy: { collectedAt: 'desc' },
    });
    if (byUrl) return { record: byUrl, reason: 'canonical_url' };
  }

  const meta = buildContentDedupeMeta(input.contentText, input.title);
  const byNorm = await prisma.scannedContent.findFirst({
    where: {
      sourceId: input.sourceId,
      normalizedContentHash: meta.normalizedContentHash,
    },
    orderBy: { collectedAt: 'desc' },
  });
  if (byNorm) return { record: byNorm, reason: 'normalized_hash' };

  return null;
}

export async function decideFindingDedupe(input: {
  companyId: string | null;
  sourceId: string;
  scannedContentId: string;
  contentText: string;
  authorName?: string | null;
  title?: string | null;
  excludeFindingId?: string | null;
}): Promise<FindingDedupeDecision> {
  const meta = buildContentDedupeMeta(input.contentText, input.title);

  // Same normalized hash on another finding in company/source
  const sameNormContent = await prisma.scannedContent.findMany({
    where: {
      sourceId: input.sourceId,
      normalizedContentHash: meta.normalizedContentHash,
      id: { not: input.scannedContentId },
    },
    select: { id: true },
    take: 20,
  });

  if (sameNormContent.length) {
    const finding = await prisma.agentFinding.findFirst({
      where: {
        scannedContentId: { in: sameNormContent.map(c => c.id) },
        type: 'lead_signal',
        dedupeStatus: { in: ['unique', 'possible_duplicate'] },
        ...(input.excludeFindingId ? { id: { not: input.excludeFindingId } } : {}),
      },
      orderBy: [{ finalScore: 'desc' }, { createdAt: 'asc' }],
    });
    if (finding) {
      return {
        status: 'duplicate',
        duplicateOfFindingId: finding.id,
        similarityScore: 1,
        reason: 'normalized_hash',
      };
    }
  }

  // Near-duplicate fingerprint within recent window
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.scannedContent.findMany({
    where: {
      sourceId: input.sourceId,
      nearDuplicateFingerprint: { not: null },
      collectedAt: { gte: since },
      id: { not: input.scannedContentId },
    },
    select: {
      id: true,
      authorName: true,
      nearDuplicateFingerprint: true,
      findings: {
        where: {
          type: 'lead_signal',
          dedupeStatus: { in: ['unique', 'possible_duplicate'] },
          ...(input.excludeFindingId ? { id: { not: input.excludeFindingId } } : {}),
        },
        select: { id: true, finalScore: true, createdAt: true },
        orderBy: [{ finalScore: 'desc' }, { createdAt: 'asc' }],
        take: 1,
      },
    },
    take: 80,
  });

  let best: { findingId: string; score: number; sameAuthor: boolean } | null = null;
  for (const c of candidates) {
    if (!c.nearDuplicateFingerprint || !c.findings[0]) continue;
    const score = hammingSimilarity(meta.nearDuplicateFingerprint, c.nearDuplicateFingerprint);
    if (!best || score > best.score) {
      best = {
        findingId: c.findings[0].id,
        score,
        sameAuthor:
          Boolean(input.authorName) &&
          Boolean(c.authorName) &&
          String(input.authorName).toLowerCase() === String(c.authorName).toLowerCase(),
      };
    }
  }

  if (best && best.score >= NEAR_DUPLICATE_THRESHOLD && best.sameAuthor) {
    return {
      status: 'duplicate',
      duplicateOfFindingId: best.findingId,
      similarityScore: best.score,
      reason: 'near_duplicate_same_author',
    };
  }

  if (best && best.score >= POSSIBLE_DUPLICATE_THRESHOLD) {
    return {
      status: 'possible_duplicate',
      duplicateOfFindingId: best.findingId,
      similarityScore: best.score,
      reason: best.sameAuthor ? 'near_duplicate_same_author' : 'near_duplicate_different_author',
    };
  }

  return {
    status: 'unique',
    duplicateOfFindingId: null,
    similarityScore: null,
    reason: null,
  };
}

export function serializeFindingBigInts<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of ['budgetMin', 'budgetMax', 'askingPrice']) {
    const val = out[key];
    if (typeof val === 'bigint') out[key] = val.toString();
  }
  return out as T;
}

export type { AgentFinding };
