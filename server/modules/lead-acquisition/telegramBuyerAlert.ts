/**
 * Telegram Buyer Alert V2 — Sales Action Card.
 * One card per lead; hide empty fields; gate by shared buyer heat.
 */

import { sendNotification } from '../../notifications/notificationRouter';
import type { LeadAcquisitionProfile } from './types';
import { prisma } from '../../prisma';
import {
  buildLeadCenterUrl,
  formatAreaLabel,
  formatSalesActionCard,
  formatSourceLabel,
  salesActionCardKeyboard,
} from '../sales-layer/telegramSalesActionCard';
import {
  resolveBuyerConfidencePct,
  shouldSendBuyerAlert,
} from '../sales-layer/buyerHeat';
import { readSalesProfile } from '../sales-layer/salesService';

export function buyerAlertKeyboard(input: {
  findingId: string;
  openUrl?: string | null;
}) {
  return salesActionCardKeyboard({
    findingId: input.findingId,
    sourceUrl: input.openUrl,
    leadCenterUrl: buildLeadCenterUrl(input.findingId),
  });
}

/** @deprecated Prefer formatSalesActionCard — kept for smoke/compat */
export function formatBuyerAlertText(input: {
  profile: LeadAcquisitionProfile;
  title?: string | null;
  budgetMin?: number | bigint | null;
  budgetMax?: number | bigint | null;
  personName?: string | null;
  location?: string | null;
  propertyType?: string | null;
  sourceLabel?: string | null;
  needSummary?: string | null;
  summary?: string | null;
  areaLabel?: string | null;
  hasPhone?: boolean;
}): string {
  return formatSalesActionCard({
    findingId: input.profile.findingId,
    acquisition: input.profile,
    actorName: input.personName,
    propertyType: input.propertyType,
    location: input.location,
    budgetMin: input.budgetMin,
    budgetMax: input.budgetMax,
    areaLabel: input.areaLabel,
    timeline: input.profile.timeline,
    campaignName: input.profile.campaignMatch.campaignName,
    sourceLabel: input.sourceLabel,
    title: input.title,
    needSummary: input.needSummary,
    summary: input.summary,
    hasPhone: input.hasPhone,
    whyReasons: input.profile.intent.reasons,
  });
}

export async function maybeSendBuyerAlert(input: {
  findingId: string;
  profile: LeadAcquisitionProfile;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: input.findingId },
    select: {
      id: true,
      title: true,
      summary: true,
      needSummary: true,
      personName: true,
      primaryPhone: true,
      primaryLocation: true,
      propertyType: true,
      budgetMin: true,
      budgetMax: true,
      companyId: true,
      extractedData: true,
      scannedContent: { select: { canonicalUrl: true } },
      source: { select: { name: true, type: true } },
    },
  });
  if (!finding) return { ok: false, skipped: true, reason: 'missing' };
  if (!input.profile.isBuyer) return { ok: false, skipped: true, reason: 'not_buyer' };

  const sales = readSalesProfile(finding.extractedData);
  const confidencePct = resolveBuyerConfidencePct({
    salesConfidencePct: sales
      ? Math.round(
          (input.profile.intent.confidence ?? 0.4) * 100 +
            (sales.signals?.length || 0) * 2,
        )
      : null,
    acquisitionFinalScore: input.profile.priority.finalScore,
    intentConfidence: input.profile.intent.confidence,
  });

  if (!shouldSendBuyerAlert(confidencePct)) {
    return { ok: false, skipped: true, reason: 'below_heat_threshold' };
  }

  const sourceUrl = finding.scannedContent?.canonicalUrl || null;
  const text = formatSalesActionCard({
    findingId: finding.id,
    acquisition: input.profile,
    sales,
    confidencePct,
    actorName: finding.personName,
    propertyType: finding.propertyType,
    location: finding.primaryLocation,
    budgetMin: finding.budgetMin,
    budgetMax: finding.budgetMax,
    areaLabel: formatAreaLabel(finding.extractedData),
    timeline: input.profile.timeline,
    campaignName: input.profile.campaignMatch.campaignName,
    sourceLabel: formatSourceLabel({
      sourceName: finding.source?.name,
      sourceType: finding.source?.type,
    }),
    sourceUrl,
    title: finding.title,
    needSummary: finding.needSummary,
    summary: finding.summary,
    hasPhone: Boolean(finding.primaryPhone),
    whyReasons: input.profile.intent.reasons,
  });

  const replyMarkup = salesActionCardKeyboard({
    findingId: finding.id,
    sourceUrl,
    leadCenterUrl: buildLeadCenterUrl(finding.id),
    hasPhone: Boolean(finding.primaryPhone),
  });

  const send = await sendNotification({
    type: 'lead_found',
    immediate: true,
    skipDedup: false,
    dedupeKey: `buyer_alert:${finding.id}`,
    text,
    replyMarkup,
    payload: {
      findingId: finding.id,
      entityId: finding.id,
      score: confidencePct,
      summary: text,
      title: 'Buyer Lead',
      postUrl: sourceUrl,
    },
  });

  return send.ok
    ? { ok: true }
    : { ok: false, reason: send.error || 'send_failed' };
}
