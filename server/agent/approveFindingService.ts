import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../src/types';
import { prisma } from '../prisma';
import { canAccessAgentRecord } from './agentDb';
import { evaluateRealEstateRelevance } from './domainClassification';
import { extractLeadData, toRawExtracted } from './extractors';
import {
  actorRoleFromClassification,
  normalizeClassification,
  normalizeIntent,
  priorityFromScore,
  type ActorRole,
  type LeadClassification,
} from './leadIntelligence';
import { detectSubjectDirection } from './subjectDirection';
import { enqueueFindingUpsertSync, enqueueScannedContentSync } from '../agentSync/enqueue';
import { notifyFindingIfEligible } from '../notifications/telegramNotificationService';

function resolveManualClassification(contentText: string): {
  classification: LeadClassification;
  actorRole: ActorRole;
  intent: string;
  reasons: string[];
} {
  const direction = detectSubjectDirection(contentText);
  const extracted = extractLeadData(contentText);
  const reasons: string[] = ['manual_approve_from_scanned_content'];

  let classification: LeadClassification =
    direction.classification !== 'unknown'
      ? direction.classification
      : normalizeClassification(extracted.property.classification || 'unknown');

  // Listing heuristics when extractors/direction stay unknown
  if (classification === 'unknown') {
    if (/phòng\s*trọ|dãy\s*trọ|cho\s*thuê|giá\s*thuê|\d+\s*tr[yỷ]?\b.*(?:phòng|trọ)/i.test(contentText)) {
      classification = 'landlord';
      reasons.push('heuristic:rental_listing');
    } else if (
      /(?:bán|ra\s*nhanh|chính\s*chủ|giá\s*chỉ|lh\s*:|hotline).{0,40}(?:nhà|đất|căn|lô|căn\s*hộ)/i.test(
        contentText,
      ) ||
      /(?:nhà|đất|căn\s*hộ|lô).{0,40}(?:bán|ra\s*nhanh|giá\s*chỉ|\d+\s*t[yỷ])/i.test(contentText)
    ) {
      classification = 'seller';
      reasons.push('heuristic:sale_listing');
    } else if (/(?:cần|muốn|tìm)\s*(?:mua|thuê)/i.test(contentText)) {
      classification = /thuê/i.test(contentText) ? 'renter' : 'buyer';
      reasons.push('heuristic:demand');
    }
  }

  let actorRole: ActorRole =
    direction.actorRole !== 'unknown'
      ? direction.actorRole
      : actorRoleFromClassification(classification);

  const intent =
    direction.intent !== 'unknown'
      ? direction.intent
      : normalizeIntent(extracted.property.intent || 'unknown');

  if (direction.classification !== 'unknown') {
    reasons.push(`subject_direction=${direction.classification}`);
  }

  return { classification, actorRole, intent, reasons };
}

/**
 * Manually approve a ScannedContent into an AgentFinding, then enqueue VPS sync.
 */
export async function approveScannedContentAsFinding(input: {
  id: string;
  user: AuthUser;
  note?: string;
}): Promise<{
  contentId: string;
  findingId: string;
  created: boolean;
  syncEnqueued: boolean;
  telegramSent: boolean;
  telegramReason: string | null;
  classification: string;
  actorRole: string;
  inboxHint: string;
}> {
  const existing = await prisma.scannedContent.findUnique({
    where: { id: input.id },
    include: {
      findings: {
        where: { type: 'lead_signal' },
        select: {
          id: true,
          type: true,
          status: true,
          classification: true,
          actorRole: true,
        },
        take: 5,
      },
      source: { select: { id: true, name: true, type: true } },
    },
  });
  if (!existing) throw new Error('Không tìm thấy nội dung quét.');
  if (!canAccessAgentRecord(input.user, existing.companyId)) {
    throw new Error('Không có quyền.');
  }

  const relevance = evaluateRealEstateRelevance(existing.contentText);
  const resolved = resolveManualClassification(existing.contentText);
  const { classification, actorRole, intent, reasons } = resolved;

  if (input.note) reasons.push(`note=${input.note}`);
  if (relevance.domain.classification !== 'real_estate') {
    reasons.push(`domain=${relevance.domain.classification}`);
  }

  const extracted = extractLeadData(existing.contentText);
  const raw = toRawExtracted(extracted);
  const title =
    existing.contentText.replace(/\s+/g, ' ').trim().slice(0, 90) ||
    `Lead thủ công từ ${existing.source?.name || 'scan'}`;
  const summary = existing.contentText.slice(0, 600);
  const hasPhone = Boolean(extracted.phone.primaryPhone);
  const score = Math.max(50, Math.min(85, 55 + (hasPhone ? 15 : 0)));
  const priority = priorityFromScore(score, hasPhone);

  const inboxHint =
    actorRole === 'demand_side' && ['buyer', 'renter', 'investor'].includes(classification)
      ? 'Xem tab Lead Intelligence (Mới).'
      : actorRole === 'supply_side' || classification === 'seller' || classification === 'landlord'
        ? 'Xem tab Nguồn hàng (supply).'
        : 'Xem tab Cần xem lại (classification chưa rõ).';

  const columnData = {
    score,
    finalScore: score,
    leadFitScore: score,
    keywordScore: null as number | null,
    aiScore: null as number | null,
    title,
    summary,
    classification,
    intent,
    actorRole,
    priority,
    primaryPhone: extracted.phone.primaryPhone || null,
    primaryLocation: extracted.location.primaryLocation || null,
    budgetMin: extracted.money.budgetMin != null ? BigInt(extracted.money.budgetMin) : null,
    budgetMax: extracted.money.budgetMax != null ? BigInt(extracted.money.budgetMax) : null,
    askingPrice: extracted.money.askingPrice != null ? BigInt(extracted.money.askingPrice) : null,
    propertyType: extracted.property.propertyTypes?.[0] || null,
    personName: null as string | null,
    needSummary: summary.slice(0, 280),
    scoreStatus: 'manual_approved',
    reviewedAt: new Date(),
    reviewedBy: input.user.id,
    dismissedAt: null as Date | null,
    dismissedBy: null as string | null,
    dismissReason: null as string | null,
    dedupeStatus: 'unique',
    intelligenceVersion: 'manual-approve-v2',
    extractedData: {
      ...raw,
      classification,
      intent,
      actorRole,
      domain: {
        classification: relevance.domain.classification,
        decision: relevance.decision,
        reasonCode: relevance.reasonCode,
        transactionObject: relevance.domain.transactionObject,
      },
      manualApprove: true,
      approvedBy: input.user.id,
      approvedAt: new Date().toISOString(),
      note: input.note || null,
    } as unknown as Prisma.InputJsonValue,
    reasons: reasons as unknown as Prisma.InputJsonValue,
    syncStatus: 'pending',
    status: 'new',
  };

  const existingFinding =
    existing.findings.find((f) => f.status !== 'dismissed') || existing.findings[0] || null;

  let findingId: string;
  let created = false;

  if (existingFinding) {
    await prisma.agentFinding.update({
      where: { id: existingFinding.id },
      data: columnData,
    });
    findingId = existingFinding.id;
  } else {
    const finding = await prisma.agentFinding.create({
      data: {
        companyId: existing.companyId,
        sourceId: existing.sourceId,
        scannedContentId: existing.id,
        type: 'lead_signal',
        ...columnData,
      },
    });
    findingId = finding.id;
    created = true;
  }

  await prisma.scannedContent.update({
    where: { id: existing.id },
    data: {
      status: 'analyzed',
      syncStatus: 'pending',
      syncError: null,
      metrics: {
        ...((existing.metrics && typeof existing.metrics === 'object'
          ? existing.metrics
          : {}) as object),
        leadAnalysis: {
          filterStage: 'created_finding',
          analysisMode: 'manual_approve',
          finalScore: score,
          classification,
          actorRole,
          findingId,
          analyzedAt: new Date().toISOString(),
          reasons,
          domain: relevance.domain.classification,
        },
      } as Prisma.InputJsonValue,
    },
  });

  let syncEnqueued = false;
  try {
    await enqueueScannedContentSync({ scannedContentId: existing.id, kickFlush: false });
    const sync = await enqueueFindingUpsertSync({ findingId, kickFlush: true });
    syncEnqueued = Boolean(sync.enqueued);
  } catch (error) {
    console.warn(
      '[approveFinding] sync enqueue failed:',
      error instanceof Error ? error.message : error,
    );
  }

  // Manual approve always attempts Telegram (force), even when local→VPS sync is on.
  let telegramSent = false;
  let telegramReason: string | null = null;
  try {
    const tg = await notifyFindingIfEligible({ findingId, force: true });
    telegramSent = Boolean(tg.ok);
    telegramReason = tg.ok ? null : tg.reason || tg.error || 'telegram_failed';
  } catch (error) {
    telegramReason = error instanceof Error ? error.message : 'telegram_error';
    console.warn('[approveFinding] telegram failed:', telegramReason);
  }

  return {
    contentId: existing.id,
    findingId,
    created,
    syncEnqueued,
    telegramSent,
    telegramReason,
    classification,
    actorRole,
    inboxHint,
  };
}
