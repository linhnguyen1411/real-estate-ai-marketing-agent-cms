/**
 * Telegram Sales cards — cooling alert + re-exports of Sales Action Card.
 */

import { sendNotification } from '../../notifications/notificationRouter';
import type { SalesLayerProfile } from './types';
import { prisma } from '../../prisma';
import {
  buildLeadCenterUrl,
  formatSalesActionCard,
  formatSalesBuyerCard,
  salesActionCardKeyboard,
  salesBuyerCardKeyboard,
} from './telegramSalesActionCard';

export {
  formatSalesActionCard,
  formatSalesBuyerCard,
  salesActionCardKeyboard,
  salesBuyerCardKeyboard,
  assignOwnerKeyboard,
  buildLeadCenterUrl,
  formatBudgetLabel,
  formatAreaLabel,
  formatSourceLabel,
  buildActionableRecommendation,
  summarizeSignal,
  buildLeadNeed,
  buildSalesActionCardViewModel,
  resolveSourceProvenance,
  resolveLeadSource,
  validateSourceProvenance,
  isTrustedContentUrl,
  looksLikeConfigSourceName,
  toTelUri,
  stripInternalPollution,
  truncFindingIdForCallback,
} from './telegramSalesActionCard';
export type { LeadAlertRole, SalesActionCardViewModel } from './telegramSalesActionCard';

export async function maybeSendCoolingAlert(input: {
  findingId: string;
  profile: SalesLayerProfile;
  confidencePct: number;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: input.findingId },
    select: {
      id: true,
      title: true,
      personName: true,
      primaryPhone: true,
      primaryLocation: true,
      propertyType: true,
      budgetMin: true,
      budgetMax: true,
      needSummary: true,
      summary: true,
      extractedData: true,
      scannedContent: { select: { canonicalUrl: true } },
      source: { select: { name: true, type: true } },
    },
  });
  if (!finding) return { ok: false, skipped: true, reason: 'missing' };
  if (!input.profile.followUp.needsFollowUp) {
    return { ok: false, skipped: true, reason: 'not_cooling' };
  }

  const sourceUrl = finding.scannedContent?.canonicalUrl || null;
  const body = formatSalesActionCard({
    findingId: finding.id,
    actorName: finding.personName,
    propertyType: finding.propertyType,
    location: finding.primaryLocation,
    budgetMin: finding.budgetMin,
    budgetMax: finding.budgetMax,
    title: finding.title,
    needSummary: finding.needSummary,
    summary: finding.summary,
    sales: input.profile,
    confidencePct: input.confidencePct,
    hasPhone: Boolean(finding.primaryPhone),
    sourceUrl,
    sourceLabel: finding.source?.name || finding.source?.type || null,
  });

  const text = [
    '⚠ Buyer đang nguội.',
    input.profile.followUp.reason || '',
    input.profile.followUp.suggestion || 'Nên follow-up.',
    '',
    body,
  ]
    .filter(Boolean)
    .join('\n');

  const send = await sendNotification({
    type: 'lead_score',
    immediate: true,
    dedupeKey: `buyer_cool:${finding.id}:${Math.floor(input.profile.followUp.coolingHours / 24)}`,
    text,
    replyMarkup: salesActionCardKeyboard({
      findingId: finding.id,
      sourceUrl,
      leadCenterUrl: buildLeadCenterUrl(finding.id),
      hasPhone: Boolean(finding.primaryPhone),
    }),
    payload: {
      findingId: finding.id,
      entityId: finding.id,
      score: input.confidencePct,
      summary: text,
      title: 'Buyer cooling',
    },
  });

  return send.ok ? { ok: true } : { ok: false, reason: send.error || 'send_failed' };
}
