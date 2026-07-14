/**
 * Manual matching: official CMS inventory + External Inventory (separate groups).
 */

import crypto from 'crypto';
import { prisma } from '../prisma';
import type { AuthUser } from '../../src/types';
import { resolveLeadIntelligence } from '../../shared/agent-domain';
import { canAccessAgentRecord } from './agentDb';
import { matchPropertiesForLead } from './propertyMatchingService';

export type MatchInventoryItem = {
  itemId: string;
  title: string;
  sourceType: string | null;
  inventoryKind: 'official' | 'external';
  matchScore: number;
  price: number | null;
  rentPrice?: number | null;
  location: string | null;
  area: number | null;
  contact: string | null;
  verificationStatus?: string | null;
  matchReasons: string[];
  detailUrl: string | null;
};

export type FindingMatchResult = {
  official: MatchInventoryItem[];
  external: MatchInventoryItem[];
  missingReason: string | null;
};

function serializeFinding(row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  for (const key of ['budgetMin', 'budgetMax', 'askingPrice']) {
    const val = out[key];
    if (typeof val === 'bigint') out[key] = val.toString();
  }
  return out;
}

function moneyNum(v: string | number | bigint | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function scoreExternalItem(
  item: {
    title: string;
    propertyType: string | null;
    transactionType: string;
    askingPriceMin: bigint | null;
    askingPriceMax: bigint | null;
    rentPrice: bigint | null;
    city: string | null;
    district: string | null;
    areaMinM2: number | null;
    areaMaxM2: number | null;
    contactPhone: string | null;
    verificationStatus: string;
  },
  demand: {
    classification: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    rentMax: number | null;
    location: string | null;
    propertyTypes: string[];
    areaMin: number | null;
    areaMax: number | null;
    requirements: string[];
  },
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const wantRent = demand.classification === 'renter';
  if (wantRent && item.transactionType === 'rent') {
    score += 20;
    reasons.push('Đúng loại giao dịch thuê');
  } else if (!wantRent && (item.transactionType === 'sell' || item.transactionType === 'transfer')) {
    score += 20;
    reasons.push('Đúng loại giao dịch bán');
  }

  if (demand.propertyTypes.length && item.propertyType) {
    const hit = demand.propertyTypes.some(t =>
      item.propertyType!.toLowerCase().includes(t.toLowerCase()) ||
      t.toLowerCase().includes(item.propertyType!.toLowerCase()),
    );
    if (hit) {
      score += 25;
      reasons.push(`Loại BĐS khớp: ${item.propertyType}`);
    }
  }

  const locHay = `${item.city || ''} ${item.district || ''}`.toLowerCase();
  if (demand.location && locHay.includes(demand.location.toLowerCase().split(',')[0].trim())) {
    score += 25;
    reasons.push(`Khu vực khớp: ${item.city || item.district}`);
  }

  if (wantRent && demand.rentMax && item.rentPrice) {
    const rent = Number(item.rentPrice);
    if (rent <= demand.rentMax * 1.1) {
      score += 20;
      reasons.push('Giá thuê trong ngân sách');
    }
  } else if (!wantRent && (demand.budgetMin || demand.budgetMax)) {
    const price = Number(item.askingPriceMin ?? item.askingPriceMax ?? 0);
    if (price > 0) {
      const min = demand.budgetMin ?? 0;
      const max = demand.budgetMax ?? Number.POSITIVE_INFINITY;
      if (price >= min * 0.85 && price <= max * 1.15) {
        score += 20;
        reasons.push('Giá trong ngân sách');
      }
    }
  }

  if (demand.areaMin || demand.areaMax) {
    const area = item.areaMinM2 ?? item.areaMaxM2;
    if (area) {
      const min = demand.areaMin ?? 0;
      const max = demand.areaMax ?? Number.POSITIVE_INFINITY;
      if (area >= min * 0.8 && area <= max * 1.2) {
        score += 10;
        reasons.push('Diện tích phù hợp');
      }
    }
  }

  if (item.verificationStatus === 'verified') {
    score += 5;
    reasons.push('Đã xác minh (ngoài)');
  }

  return { score: Math.min(100, score), reasons };
}

export async function matchFindingInventories(input: {
  findingId: string;
  user: AuthUser;
  limit?: number;
}): Promise<FindingMatchResult> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: input.findingId },
    include: {
      source: { select: { id: true, name: true, type: true } },
      scannedContent: true,
    },
  });
  if (!finding) throw new Error('Không tìm thấy finding.');
  if (!canAccessAgentRecord(input.user, finding.companyId)) {
    throw new Error('Không có quyền truy cập finding này.');
  }

  const resolved = resolveLeadIntelligence(serializeFinding(finding as unknown as Record<string, unknown>));
  if (!resolved.matchingEnabled) {
    return {
      official: [],
      external: [],
      missingReason: 'Matching chỉ dành cho buyer/renter/investor (demand-side).',
    };
  }

  const limit = input.limit ?? 10;
  const budgetMin = moneyNum(resolved.demand.buyerBudgetMin);
  const budgetMax = moneyNum(resolved.demand.buyerBudgetMax);
  const rentMax = moneyNum(resolved.demand.rentBudgetMax);

  const officialRaw = await matchPropertiesForLead({
    companyId: finding.companyId,
    classification: resolved.classification || 'buyer',
    budgetMin,
    budgetMax,
    location: resolved.location.primary,
    propertyTypes: resolved.property.propertyTypes,
    purpose: resolved.demand.purpose,
    requirements: resolved.requirements.otherRequirements,
    limit,
  });

  const official: MatchInventoryItem[] = officialRaw.items.map(item => ({
    itemId: item.propertyId,
    title: item.title,
    sourceType: 'official_cms',
    inventoryKind: 'official' as const,
    matchScore: Math.min(100, item.matchScore + 8), // verification bonus for official
    price: item.price,
    location: item.location,
    area: null,
    contact: null,
    matchReasons: [...item.reasons, 'Giỏ hàng chính thức'],
    detailUrl: item.url,
  }));

  const externalRows = await prisma.externalInventoryItem.findMany({
    where: {
      ...(finding.companyId ? { companyId: finding.companyId } : {}),
      status: 'active',
    },
    orderBy: { updatedAt: 'desc' },
    take: 80,
  });

  const external: MatchInventoryItem[] = externalRows
    .map(row => {
      const { score, reasons } = scoreExternalItem(row, {
        classification: resolved.classification,
        budgetMin,
        budgetMax,
        rentMax,
        location: resolved.location.primary,
        propertyTypes: resolved.property.propertyTypes,
        areaMin: resolved.property.areaMinM2,
        areaMax: resolved.property.areaMaxM2,
        requirements: resolved.requirements.otherRequirements,
      });
      return {
        itemId: row.id,
        title: row.title,
        sourceType: row.sourceType,
        inventoryKind: 'external' as const,
        matchScore: score,
        price: row.askingPriceMin != null ? Number(row.askingPriceMin) : null,
        rentPrice: row.rentPrice != null ? Number(row.rentPrice) : null,
        location: [row.city, row.district].filter(Boolean).join(', ') || null,
        area: row.areaMinM2,
        contact: row.contactPhone,
        verificationStatus: row.verificationStatus,
        matchReasons: reasons,
        detailUrl: row.sourceUrl,
      };
    })
    .filter(i => i.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  const missingReason =
    !official.length && !external.length
      ? officialRaw.missingReason || 'Không có kết quả match phù hợp.'
      : null;

  return { official, external, missingReason };
}

export async function saveFindingMatchEvent(input: {
  findingId: string;
  user: AuthUser;
  inventoryKind: 'official' | 'external';
  itemId: string;
  matchScore: number;
  reasons: string[];
  note?: string;
  sentToClient?: boolean;
}) {
  const finding = await prisma.agentFinding.findUnique({ where: { id: input.findingId } });
  if (!finding) throw new Error('Không tìm thấy finding.');
  if (!canAccessAgentRecord(input.user, finding.companyId)) {
    throw new Error('Không có quyền.');
  }

  return prisma.agentFindingMatchEvent.create({
    data: {
      id: `fme-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      companyId: finding.companyId,
      findingId: input.findingId,
      inventoryKind: input.inventoryKind,
      itemId: input.itemId,
      matchScore: input.matchScore,
      reasons: input.reasons,
      note: input.note || null,
      userId: input.user.id,
      sentToClient: Boolean(input.sentToClient),
    },
  });
}

export async function listFindingMatchEvents(findingId: string, user: AuthUser) {
  const finding = await prisma.agentFinding.findUnique({ where: { id: findingId } });
  if (!finding) throw new Error('Không tìm thấy finding.');
  if (!canAccessAgentRecord(user, finding.companyId)) {
    throw new Error('Không có quyền.');
  }
  return prisma.agentFindingMatchEvent.findMany({
    where: { findingId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
