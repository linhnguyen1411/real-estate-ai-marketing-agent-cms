/**
 * External Inventory — Giỏ hàng ngoài (separate from official CMS inventory).
 */

import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import type { AuthUser } from '../../src/types';
import { resolveLeadIntelligence } from '../../shared/agent-domain';
import { markFindingConsumed } from '../dataLifecycle/entityTransitionService';
import {
  EntityNotFoundError,
  TenantScopeError,
} from '../dataLifecycle/domainErrors';
import { buildCompanyScopeFilter, canAccessAgentRecord } from './agentDb';
import type { PaginationInput } from './agentTypes';
import { runInTransaction } from '../repositories/shared/repositoryTypes';
import * as findingRepo from '../repositories/agent/agentFindingRepository';
import * as inventoryRepo from '../repositories/inventory/externalInventoryRepository';

export type SaveExternalInventoryResult = {
  outcome: 'created' | 'existing';
  itemId: string;
  duplicateReason: string | null;
  requiresConfirmation?: boolean;
  warning?: string;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function serializeFinding(row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  for (const key of ['budgetMin', 'budgetMax', 'askingPrice']) {
    const val = out[key];
    if (typeof val === 'bigint') out[key] = val.toString();
  }
  return out;
}

function toBigInt(value: string | number | null | undefined): bigint | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.floor(n));
}

function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text.replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex');
}

function mapInventoryPropertyType(types: string[]): string | null {
  if (!types.length) return null;
  if (types.includes('land') || types.some(t => /đất|lô/.test(t))) return 'land';
  return types[0];
}

function buildExternalInventoryTitle(resolved: ReturnType<typeof resolveLeadIntelligence>): string {
  const typeLabel =
    resolved.propertyTypes.includes('land') || resolved.propertyTypes.some(t => /đất|lô/.test(t))
      ? 'Lô đất'
      : resolved.propertyTypes.find(t => t !== 'land') || 'BĐS';
  const area =
    resolved.property.areaMinM2 != null
      ? ` ${resolved.property.areaMinM2} m²`
      : '';
  const city = resolved.location.city ? ` tại ${resolved.location.city}` : '';
  const road =
    resolved.property.roadWidthMeters != null
      ? `, đường ${String(resolved.property.roadWidthMeters).replace('.', ',')} m`
      : '';
  const built = `${typeLabel}${area}${city}${road}`.trim();
  if (built.length > 8) return built;
  return resolved.title || built;
}

function inferTransactionType(resolved: ReturnType<typeof resolveLeadIntelligence>): string {
  if (resolved.classification === 'landlord' || resolved.intent === 'lease_out') return 'rent';
  if (resolved.classification === 'seller' || resolved.intent === 'sell') return 'sell';
  if (resolved.intent === 'rent') return 'rent';
  if (resolved.askingPrice) return 'sell';
  return 'unknown';
}

async function findDuplicateItem(input: {
  companyId: string | null;
  sourceUrl: string | null;
  contentHash: string;
  contactPhone: string | null;
  title: string;
  city: string | null;
  askingPriceMin: bigint | null;
  areaMinM2: number | null;
}): Promise<{ id: string; reason: string } | null> {
  const scope = input.companyId ? { companyId: input.companyId } : {};

  if (input.sourceUrl) {
    const byUrl = await prisma.externalInventoryItem.findFirst({
      where: { ...scope, sourceUrl: input.sourceUrl, status: { not: 'dismissed' } },
      select: { id: true },
    });
    if (byUrl) return { id: byUrl.id, reason: 'canonicalUrl' };
  }

  const byHash = await prisma.externalInventoryItem.findFirst({
    where: { ...scope, contentHash: input.contentHash, status: { not: 'dismissed' } },
    select: { id: true },
  });
  if (byHash) return { id: byHash.id, reason: 'contentHash' };

  if (input.contactPhone && input.title) {
    const byPhoneTitle = await prisma.externalInventoryItem.findFirst({
      where: {
        ...scope,
        contactPhone: input.contactPhone,
        title: input.title,
        status: { not: 'dismissed' },
      },
      select: { id: true },
    });
    if (byPhoneTitle) return { id: byPhoneTitle.id, reason: 'phone+title' };
  }

  if (input.city && input.askingPriceMin && input.areaMinM2) {
    const byLoc = await prisma.externalInventoryItem.findFirst({
      where: {
        ...scope,
        city: input.city,
        askingPriceMin: input.askingPriceMin,
        areaMinM2: input.areaMinM2,
        status: { not: 'dismissed' },
      },
      select: { id: true },
    });
    if (byLoc) return { id: byLoc.id, reason: 'location+price+area' };
  }

  return null;
}

export async function saveFindingToExternalInventory(input: {
  findingId: string;
  user: AuthUser;
  force?: boolean;
}): Promise<SaveExternalInventoryResult> {
  const finding = await findingRepo.findFindingById(input.findingId, undefined, {
    source: { select: { id: true, name: true, type: true } },
    scannedContent: true,
  });
  if (!finding) throw new EntityNotFoundError('Không tìm thấy finding.');
  if (!canAccessAgentRecord(input.user, finding.companyId)) {
    throw new TenantScopeError('Không có quyền truy cập finding này.');
  }

  if (finding.externalInventoryItemId) {
    return {
      outcome: 'existing',
      itemId: finding.externalInventoryItemId,
      duplicateReason: 'already_saved',
    };
  }

  const resolved = resolveLeadIntelligence(serializeFinding(finding as unknown as Record<string, unknown>));

  if (resolved.isDemandSide && !resolved.externalInventoryPreferred && !input.force) {
    return {
      outcome: 'existing',
      itemId: '',
      duplicateReason: null,
      requiresConfirmation: true,
      warning:
        'Finding này là nhu cầu khách hàng, không phải nguồn hàng. Bạn có chắc muốn lưu?',
    };
  }

  const original =
    resolved.content.fullOriginalContent ||
    finding.scannedContent?.contentText ||
    finding.summary;
  const hash = contentHash(original);
  const askingMin = toBigInt(resolved.askingPrice ?? null);
  const askingMax =
    resolved.priceQualifier === 'slightly_above' || resolved.priceQualifier === 'above'
      ? null
      : toBigInt(resolved.askingPrice ?? null);
  const rentPrice = toBigInt(resolved.demand.rentBudgetMax);
  const inventoryTitle = buildExternalInventoryTitle(resolved);
  const additionalPhones = resolved.contact.secondaryPhones.filter(Boolean);

  const dup = await findDuplicateItem({
    companyId: finding.companyId,
    sourceUrl: resolved.source.canonicalUrl,
    contentHash: hash,
    contactPhone: resolved.primaryPhone,
    title: inventoryTitle,
    city: resolved.location.city,
    askingPriceMin: askingMin,
    areaMinM2: resolved.property.areaMinM2,
  });

  return runInTransaction(async tx => {
    // Re-check already saved inside tx
    const fresh = await findingRepo.findFindingById(finding.id, tx);
    if (fresh?.externalInventoryItemId) {
      return {
        outcome: 'existing' as const,
        itemId: fresh.externalInventoryItemId,
        duplicateReason: 'already_saved',
      };
    }

    if (dup) {
      await markFindingConsumed(tx, {
        findingId: finding.id,
        status: 'saved_to_external_inventory',
        consumptionType: 'external_inventory',
        resourceId: dup.id,
        resourceType: 'external_inventory',
        userId: input.user.id,
      });
      await inventoryRepo.createExternalInventoryEvent(
        {
          id: newId('eie'),
          itemId: dup.id,
          eventType: 'linked_finding',
          note: `Linked finding ${finding.id}`,
          userId: input.user.id,
          metadata: { findingId: finding.id, duplicateReason: dup.reason },
        },
        tx,
      );
      return { outcome: 'existing' as const, itemId: dup.id, duplicateReason: dup.reason };
    }

    const itemId = newId('extinv');
    await inventoryRepo.createExternalInventoryItem(
      {
        id: itemId,
        companyId: finding.companyId,
        findingId: finding.id,
        scannedContentId: finding.scannedContentId,
        title: inventoryTitle,
        description: resolved.demand.needSummary || resolved.content.shortDescription,
        originalContent: original || '',
        propertyType: mapInventoryPropertyType(resolved.propertyTypes),
        transactionType: inferTransactionType(resolved),
        askingPriceMin: askingMin,
        askingPriceMax: askingMax,
        rentPrice,
        city: resolved.location.city,
        district: resolved.location.district,
        ward: resolved.location.ward,
        street: resolved.location.street,
        project: resolved.location.project,
        areaMinM2: resolved.property.areaMinM2,
        areaMaxM2: resolved.property.areaMaxM2,
        frontageMeters: resolved.property.frontageMeters,
        depthMeters: resolved.property.depthMeters,
        bedrooms: resolved.property.bedrooms,
        floors: resolved.property.floors,
        legalStatus: resolved.property.legalStatus,
        direction: resolved.property.direction,
        contactName:
          resolved.contact.displayName ||
          (resolved.person.name === 'Chưa xác định' ? null : resolved.person.name),
        contactPhone: resolved.primaryPhone,
        contactFacebookUrl: resolved.person.facebookProfileUrl,
        sourceUrl: resolved.source.canonicalUrl,
        sourceName: resolved.source.sourceName,
        sourceType: resolved.source.sourceType,
        contentHash: hash,
        verificationStatus: 'unverified',
        status: 'active',
        rawData: {
          findingId: finding.id,
          classification: resolved.classification,
          priceDisplay: resolved.displayBudgetLabel,
          additionalPhones,
          roadWidthMeters: resolved.property.roadWidthMeters,
          pavementWidthMeters: resolved.property.pavementWidthMeters,
          features: resolved.property.features,
          resolvedSnippet: {
            needSummary: resolved.demand.needSummary,
            scoreStatus: resolved.scoreStatus,
          },
        },
      },
      tx,
    );

    await inventoryRepo.createExternalInventorySource(
      {
        id: newId('eis'),
        itemId,
        sourceUrl: resolved.source.canonicalUrl,
        sourceName: resolved.source.sourceName,
        authorName: resolved.source.authorName,
        authorUrl: resolved.source.authorUrl,
        publishedAt: finding.scannedContent?.publishedAt ?? null,
        collectedAt: finding.scannedContent?.collectedAt ?? null,
        rawContent: original,
      },
      tx,
    );

    await inventoryRepo.createExternalInventoryEvent(
      {
        id: newId('eie'),
        itemId,
        eventType: 'created_from_finding',
        note: 'Lưu từ Lead Intelligence',
        userId: input.user.id,
        metadata: { findingId: finding.id },
      },
      tx,
    );

    await markFindingConsumed(tx, {
      findingId: finding.id,
      status: 'saved_to_external_inventory',
      consumptionType: 'external_inventory',
      resourceId: itemId,
      resourceType: 'external_inventory',
      userId: input.user.id,
    });

    return { outcome: 'created' as const, itemId, duplicateReason: null };
  });
}

function serializeExternalItem<T extends Record<string, any>>(row: T) {
  const out: Record<string, any> = { ...row };
  for (const key of ['askingPriceMin', 'askingPriceMax', 'rentPrice']) {
    if (typeof out[key] === 'bigint') out[key] = out[key].toString();
  }
  return out;
}

export async function listExternalInventory(
  user: AuthUser,
  pagination: PaginationInput,
  filters: {
    transactionType?: string;
    propertyType?: string;
    city?: string;
    hasPhone?: boolean;
    verificationStatus?: string;
    status?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
  } = {},
) {
  const companyScope = buildCompanyScopeFilter(user);
  const and: Prisma.ExternalInventoryItemWhereInput[] = [];

  if (filters.transactionType) and.push({ transactionType: filters.transactionType });
  if (filters.propertyType) {
    and.push({ propertyType: { contains: filters.propertyType, mode: 'insensitive' } });
  }
  if (filters.city) {
    and.push({ city: { contains: filters.city, mode: 'insensitive' } });
  }
  if (filters.hasPhone === true) and.push({ contactPhone: { not: null } });
  if (filters.verificationStatus) and.push({ verificationStatus: filters.verificationStatus });
  if (filters.status) and.push({ status: filters.status });
  else and.push({ status: { not: 'dismissed' } });

  if (filters.minPrice != null || filters.maxPrice != null) {
    and.push({
      OR: [
        {
          askingPriceMin: {
            ...(filters.minPrice != null ? { gte: BigInt(filters.minPrice) } : {}),
            ...(filters.maxPrice != null ? { lte: BigInt(filters.maxPrice) } : {}),
          },
        },
        {
          rentPrice: {
            ...(filters.minPrice != null ? { gte: BigInt(filters.minPrice) } : {}),
            ...(filters.maxPrice != null ? { lte: BigInt(filters.maxPrice) } : {}),
          },
        },
      ],
    });
  }

  if (filters.search) {
    and.push({
      OR: [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { contactPhone: { contains: filters.search } },
        { city: { contains: filters.search, mode: 'insensitive' } },
        { district: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.ExternalInventoryItemWhereInput = {
    ...companyScope,
    ...(and.length ? { AND: and } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.externalInventoryItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: { sources: { take: 1, orderBy: { createdAt: 'desc' } } },
    }),
    prisma.externalInventoryItem.count({ where }),
  ]);

  return { items: items.map(serializeExternalItem), total };
}

export async function getExternalInventoryById(id: string, user: AuthUser) {
  const item = await prisma.externalInventoryItem.findUnique({
    where: { id },
    include: {
      sources: { orderBy: { createdAt: 'desc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!item) return null;
  if (!canAccessAgentRecord(user, item.companyId)) return null;
  return serializeExternalItem(item);
}

export async function patchExternalInventory(
  id: string,
  user: AuthUser,
  data: {
    status?: string;
    verificationStatus?: string;
    note?: string;
  },
) {
  const existing = await prisma.externalInventoryItem.findUnique({ where: { id } });
  if (!existing) throw new Error('Không tìm thấy item.');
  if (!canAccessAgentRecord(user, existing.companyId)) {
    throw new Error('Không có quyền.');
  }

  const updated = await prisma.externalInventoryItem.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.verificationStatus ? { verificationStatus: data.verificationStatus } : {}),
    },
  });

  if (data.note || data.status || data.verificationStatus) {
    await prisma.externalInventoryEvent.create({
      data: {
        id: newId('eie'),
        itemId: id,
        eventType: 'updated',
        note: data.note || null,
        userId: user.id,
        metadata: {
          status: data.status,
          verificationStatus: data.verificationStatus,
        },
      },
    });
  }

  return serializeExternalItem(updated);
}
