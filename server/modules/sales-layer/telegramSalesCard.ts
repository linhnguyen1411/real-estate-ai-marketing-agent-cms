/**
 * Telegram Sales cards — Buyer Card + cooling alert (no text dump).
 */

import { sendNotification } from '../../notifications/notificationRouter';
import type { InlineKeyboard } from '../control-plane/inlineKeyboard';
import type { SalesLayerProfile } from './types';
import { formatTy } from './pipelineValue';
import { prisma } from '../../prisma';

function truncId(id: string, max = 28): string {
  return id.length <= max ? id : id.slice(0, max);
}

export function salesBuyerCardKeyboard(input: {
  findingId: string;
  openUrl?: string | null;
}): InlineKeyboard {
  const id = truncId(input.findingId);
  const rows: InlineKeyboard['inline_keyboard'] = [];
  if (input.openUrl && /^https:\/\//i.test(input.openUrl)) {
    rows.push([{ text: 'Call', url: input.openUrl }]);
  } else {
    rows.push([{ text: 'Call', callback_data: `l:r:${id}` }]);
  }
  rows.push([
    { text: 'Assign', callback_data: `l:a:${id}` },
    { text: 'CRM', callback_data: `l:c:${id}` },
  ]);
  rows.push([
    { text: 'History', callback_data: `l:h:${id}` },
    { text: 'Ignore', callback_data: `l:s:${id}` },
  ]);
  return { inline_keyboard: rows };
}

export function formatSalesBuyerCard(input: {
  profile: SalesLayerProfile;
  confidencePct: number;
  campaignName?: string | null;
  title?: string | null;
}): string {
  const p = input.profile;
  const days =
    p.timeline.length >= 2
      ? Math.max(
          1,
          Math.round(
            (new Date(p.updatedAt).getTime() - new Date(p.timeline[0].at).getTime()) / 86_400_000,
          ),
        )
      : 1;

  return [
    '═══════════════════',
    '👤 Buyer',
    `${input.confidencePct}%`,
    '',
    `Campaign`,
    input.campaignName || '—',
    '',
    `Journey`,
    p.journeyStage,
    '',
    `Timeline`,
    `${days} ngày`,
    '',
    `Expected Deal`,
    p.expectedDealTy != null ? formatTy(p.expectedDealTy) : '—',
    '',
    `AI Suggestion`,
    p.recommendation.label,
    input.title ? `\n${String(input.title).slice(0, 80)}` : '',
    '═══════════════════',
  ]
    .filter(line => line !== undefined)
    .join('\n');
}

export async function maybeSendCoolingAlert(input: {
  findingId: string;
  profile: SalesLayerProfile;
  confidencePct: number;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: input.findingId },
    select: { id: true, title: true, scannedContent: { select: { canonicalUrl: true } } },
  });
  if (!finding) return { ok: false, skipped: true, reason: 'missing' };
  if (!input.profile.followUp.needsFollowUp) {
    return { ok: false, skipped: true, reason: 'not_cooling' };
  }

  const text = [
    '⚠ Buyer đang nguội.',
    input.profile.followUp.reason || '',
    input.profile.followUp.suggestion || 'Nên follow-up.',
    '',
    formatSalesBuyerCard({
      profile: input.profile,
      confidencePct: input.confidencePct,
      title: finding.title,
    }),
  ]
    .filter(Boolean)
    .join('\n');

  const send = await sendNotification({
    type: 'lead_score',
    immediate: true,
    dedupeKey: `buyer_cool:${finding.id}:${Math.floor(input.profile.followUp.coolingHours / 24)}`,
    text,
    replyMarkup: salesBuyerCardKeyboard({
      findingId: finding.id,
      openUrl: finding.scannedContent?.canonicalUrl,
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
