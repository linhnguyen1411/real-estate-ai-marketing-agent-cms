import crypto from 'crypto';
import { prisma } from '../../../prisma';
import { extractLeadData } from '../../../agent/extractors';
import type { WorkflowStepHandler } from './stepContract';
import { contentTitle, requireScannedContent } from './stepHelpers';

function contentHash(text: string): string {
  return crypto
    .createHash('sha256')
    .update(text.replace(/\s+/g, ' ').trim().toLowerCase())
    .digest('hex');
}

function mapPropertyType(types: string[]): string | null {
  if (!types.length) return null;
  if (types.includes('land') || types.some(t => /đất|lô/.test(t))) return 'land';
  return types[0];
}

function inferTransactionType(classification: string, intent: string): string {
  if (classification === 'landlord' || intent === 'lease_out') return 'rent';
  if (classification === 'seller' || intent === 'sell') return 'sell';
  if (intent === 'rent') return 'rent';
  return 'unknown';
}

export const createExternalInventoryCandidateStep: WorkflowStepHandler = {
  type: 'create_external_inventory_candidate',
  async execute(ctx) {
    const content = await requireScannedContent(ctx);
    const hash = contentHash(content.contentText);

    const byContent = await prisma.externalInventoryItem.findFirst({
      where: {
        scannedContentId: content.id,
        status: { not: 'dismissed' },
      },
      select: { id: true },
    });
    if (byContent) {
      return {
        status: 'completed',
        output: { outcome: 'existing', itemId: byContent.id },
        producedResources: { externalInventoryId: byContent.id },
        idempotent: true,
      };
    }

    const scope = content.companyId ? { companyId: content.companyId } : {};
    const byHash = await prisma.externalInventoryItem.findFirst({
      where: { ...scope, contentHash: hash, status: { not: 'dismissed' } },
      select: { id: true },
    });
    if (byHash) {
      return {
        status: 'completed',
        output: { outcome: 'existing', itemId: byHash.id, duplicateReason: 'contentHash' },
        producedResources: { externalInventoryId: byHash.id },
        idempotent: true,
      };
    }

    const extracted = extractLeadData(content.contentText);
    const title = contentTitle(content);
    const propertyType = mapPropertyType(extracted.property.propertyTypes);
    const transactionType = inferTransactionType(
      extracted.property.classification,
      extracted.property.intent,
    );
    const askingPrice = extracted.money.askingPrice
      ? BigInt(Math.floor(extracted.money.askingPrice))
      : null;

    const item = await prisma.externalInventoryItem.create({
      data: {
        companyId: content.companyId,
        scannedContentId: content.id,
        title,
        description: content.contentText.slice(0, 600),
        originalContent: content.contentText,
        propertyType,
        transactionType,
        askingPriceMin: askingPrice,
        askingPriceMax: askingPrice,
        city: extracted.location.city,
        district: extracted.location.district,
        ward: extracted.location.ward,
        street: extracted.location.street,
        areaMinM2: extracted.property.area.areaMinM2,
        areaMaxM2: extracted.property.area.areaMaxM2,
        contactName: extracted.contact.primaryContact?.displayName ?? content.authorName,
        contactPhone: extracted.phone.primaryPhone,
        sourceUrl: content.canonicalUrl,
        sourceName: content.source.name,
        sourceType: content.source.type,
        contentHash: hash,
        verificationStatus: 'unverified',
        status: 'active',
        rawData: {
          scannedContentId: content.id,
          missionRunId: ctx.missionRunId,
          classification: extracted.property.classification,
        },
      },
    });

    return {
      status: 'completed',
      output: { outcome: 'created', itemId: item.id },
      producedResources: { externalInventoryId: item.id },
      metrics: { externalInventoryCreated: 1 },
    };
  },
};
