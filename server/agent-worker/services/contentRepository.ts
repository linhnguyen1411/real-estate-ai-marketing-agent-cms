import type { ScannedContent } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import type { FacebookPostParsed } from '../facebook/facebookDomParser';
import {
  buildRawMetadata,
  computeContentHash,
  normalizeCanonicalUrl,
  normalizeText,
} from './contentNormalizer';

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

  const existing = await prisma.scannedContent.findUnique({
    where: {
      sourceId_contentHash: {
        sourceId: input.sourceId,
        contentHash,
      },
    },
  });

  const rawData = buildRawMetadata({
    title: input.parsed.title,
    canonicalUrl,
    linkCount: input.parsed.links.length,
    publishedAt: input.parsed.publishedAt,
    excerpt: bodyText.slice(0, 300),
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
      canonicalUrl,
      contentText: bodyText,
      contentHash,
      publishedAt,
      rawData: rawData as Prisma.InputJsonValue,
      status: 'collected',
    },
    update: {
      canonicalUrl,
      contentText: bodyText,
      publishedAt,
      collectedAt: new Date(),
      rawData: rawData as Prisma.InputJsonValue,
      status: 'collected',
    },
  });

  return { record, inserted: !existing };
}

export async function findExistingFacebookPost(
  sourceId: string,
  post: Pick<FacebookPostParsed, 'externalId' | 'canonicalUrl' | 'contentText'>,
): Promise<ScannedContent | null> {
  if (post.externalId) {
    const byExternal = await prisma.scannedContent.findFirst({
      where: { sourceId, externalId: post.externalId },
    });
    if (byExternal) return byExternal;
  }

  const bodyText = normalizeText(post.contentText);
  const contentHash = computeContentHash(post.canonicalUrl, bodyText);
  return prisma.scannedContent.findUnique({
    where: {
      sourceId_contentHash: { sourceId, contentHash },
    },
  });
}

export async function saveFacebookScannedPost(input: {
  companyId: string | null;
  sourceId: string;
  post: FacebookPostParsed;
  maxContentChars: number;
}): Promise<SaveContentResult | null> {
  const bodyText = normalizeText(input.post.contentText, input.maxContentChars);
  if (!bodyText || bodyText.length < 15) return null;

  const canonicalUrl = input.post.canonicalUrl;
  const contentHash = computeContentHash(canonicalUrl, bodyText);
  const publishedAt = parsePublishedAt(input.post.publishedAt);

  const existing = await findExistingFacebookPost(input.sourceId, {
    externalId: input.post.externalId,
    canonicalUrl,
    contentText: bodyText,
  });

  const rawData = {
    ...input.post.rawData,
    platform: 'facebook',
    authorName: input.post.authorName,
    authorUrl: input.post.authorUrl,
    publishedLabel: input.post.publishedLabel,
    metrics: input.post.metrics,
    excerpt: bodyText.slice(0, 300),
  };

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
      externalId: input.post.externalId,
      canonicalUrl,
      authorName: input.post.authorName,
      authorUrl: input.post.authorUrl,
      contentText: bodyText,
      contentHash,
      publishedAt,
      rawData: rawData as Prisma.InputJsonValue,
      status: 'collected',
    },
    update: {
      externalId: input.post.externalId ?? undefined,
      canonicalUrl,
      authorName: input.post.authorName,
      authorUrl: input.post.authorUrl,
      contentText: bodyText,
      publishedAt,
      collectedAt: new Date(),
      rawData: rawData as Prisma.InputJsonValue,
      status: 'collected',
    },
  });

  return { record, inserted: !existing };
}

function parsePublishedAt(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
