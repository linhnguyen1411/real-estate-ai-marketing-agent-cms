/**
 * Telegram Lead Alert — thin façade.
 * H2.4.4: ALL NEW_LEAD alerts go through notifyFindingIfEligible (canonical card).
 * Do not send Telegram from this module directly.
 */

import type { LeadAcquisitionProfile } from './types';
import {
  buildLeadCenterUrl,
  formatSalesActionCard,
  salesActionCardKeyboard,
} from '../sales-layer/telegramSalesActionCard';

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

/** @deprecated Prefer formatSalesActionCard via notifyFindingIfEligible */
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
  phone?: string | null;
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
    phone: input.phone,
    whyReasons: input.profile.intent.reasons,
  });
}

/**
 * Emit NEW_LEAD Telegram via the single canonical producer.
 * Idempotent: shares event key with notifyFindingIfEligible.
 */
export async function maybeSendBuyerAlert(input: {
  findingId: string;
  profile: LeadAcquisitionProfile;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string; messageId?: string | null }> {
  if (!input.profile.isBuyer && input.profile.intent.intent !== 'renter') {
    return { ok: false, skipped: true, reason: 'not_demand_lead' };
  }
  const { notifyFindingIfEligible } = await import(
    '../../notifications/telegramNotificationService'
  );
  const result = await notifyFindingIfEligible({
    findingId: input.findingId,
    force: false,
  });
  if (result.ok) return { ok: true, messageId: result.messageId };
  return {
    ok: false,
    skipped: result.skipped,
    reason: result.reason || result.error || 'send_failed',
    messageId: result.messageId,
  };
}
