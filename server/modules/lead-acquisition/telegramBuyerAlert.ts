/**
 * Telegram Buyer Alert — rich card, not list dump.
 * Open / Assign / CRM / Ignore buttons.
 */

import { sendNotification } from '../../notifications/notificationRouter';
import type { InlineKeyboard } from '../control-plane/inlineKeyboard';
import type { LeadAcquisitionProfile } from './types';
import { prisma } from '../../prisma';

const TIMELINE_LABEL: Record<string, string> = {
  buying_today: 'Buying today',
  within_7_days: '<7 ngày',
  within_30_days: '<30 ngày',
  researching: 'Researching',
  long_term: 'Long term',
  unknown: 'Unknown',
};

function truncId(id: string, max = 28): string {
  return id.length <= max ? id : id.slice(0, max);
}

export function buyerAlertKeyboard(input: {
  findingId: string;
  openUrl?: string | null;
}): InlineKeyboard {
  const id = truncId(input.findingId);
  const rows: InlineKeyboard['inline_keyboard'] = [];
  if (input.openUrl && /^https:\/\//i.test(input.openUrl)) {
    rows.push([{ text: 'Open', url: input.openUrl }]);
  } else {
    rows.push([{ text: 'Open', callback_data: `l:o:${id}` }]);
  }
  rows.push([
    { text: 'Assign', callback_data: `l:a:${id}` },
    { text: 'CRM', callback_data: `l:c:${id}` },
    { text: 'Ignore', callback_data: `l:s:${id}` },
  ]);
  return { inline_keyboard: rows };
}

export function formatBuyerAlertText(input: {
  profile: LeadAcquisitionProfile;
  title?: string | null;
  budgetMin?: number | bigint | null;
  budgetMax?: number | bigint | null;
}): string {
  const p = input.profile;
  const conf = Math.round(p.intent.confidence * 100);
  const toNum = (v: number | bigint | null | undefined): number | null => {
    if (v == null) return null;
    return typeof v === 'bigint' ? Number(v) : v;
  };
  const bMin = toNum(input.budgetMin);
  const bMax = toNum(input.budgetMax);
  const budget =
    bMin != null || bMax != null
      ? [bMin, bMax]
          .filter(v => v != null)
          .map(v => `${v} tỷ`)
          .join('–')
      : '—';
  const reasons = [
    ...p.intent.matchedPatterns.slice(0, 2).map(x => `Pattern: ${x}`),
    ...p.intent.reasons.slice(0, 2),
    p.campaignMatch.campaignName ? `Match campaign ${p.campaignMatch.campaignName}` : '',
  ]
    .filter(Boolean)
    .slice(0, 3);

  return [
    '🔥 Buyer Alert',
    '',
    `Confidence  ${conf}%`,
    `Campaign  ${p.campaignMatch.campaignName || '—'}`,
    `Budget  ${budget}`,
    `Timeline  ${TIMELINE_LABEL[p.timeline] || p.timeline}`,
    `Persona  ${p.persona.persona}`,
    `Score  ${p.priority.finalScore}${p.isVip ? ' · VIP' : ''}`,
    '',
    'Reason',
    ...reasons.map(r => `• ${r}`),
    ...(input.title ? [`• ${String(input.title).slice(0, 80)}`] : []),
    '',
    `AI Suggestion  ${p.action.label}`,
    p.action.reason,
  ].join('\n');
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
      budgetMin: true,
      budgetMax: true,
      companyId: true,
      scannedContent: { select: { canonicalUrl: true } },
      extractedData: true,
    },
  });
  if (!finding) return { ok: false, skipped: true, reason: 'missing' };
  if (!input.profile.isBuyer) return { ok: false, skipped: true, reason: 'not_buyer' };

  const text = formatBuyerAlertText({
    profile: input.profile,
    title: finding.title,
    budgetMin: finding.budgetMin,
    budgetMax: finding.budgetMax,
  });

  const openUrl = finding.scannedContent?.canonicalUrl || null;
  const replyMarkup = buyerAlertKeyboard({ findingId: finding.id, openUrl });

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
      score: input.profile.priority.finalScore,
      summary: text,
      title: 'Buyer Alert',
      postUrl: openUrl,
    },
  });

  return send.ok
    ? { ok: true }
    : { ok: false, reason: send.error || 'send_failed' };
}
