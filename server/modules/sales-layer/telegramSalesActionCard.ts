/**
 * Canonical Telegram Sales Action Card (H2.4.4 / H2.4.5).
 * ONE layout for buyer / tenant / investor. Hide empty fields. No dual Score metrics.
 * Need/Source from SalesActionCardViewModel — never campaign/mission pollution.
 */

import type { InlineKeyboard } from '../control-plane/inlineKeyboard';
import type { BuyingTimeline, BuyerIntentLabel, LeadAcquisitionProfile } from '../lead-acquisition/types';
import type { SalesLayerProfile, SalesRecommendation } from './types';
import { classifyBuyerHeat, resolveBuyerConfidencePct } from './buyerHeat';
import { formatTy, normalizeTy } from './pipelineValue';
import {
  buildLeadNeed,
  buildSalesActionCardViewModel,
  formatDisplayPhone,
  resolveSourceProvenance,
  stripInternalPollution,
  toTelUri,
  type LeadAlertRole,
  type SalesActionCardViewModel,
} from './salesActionCardViewModel';

export type { LeadAlertRole, SalesActionCardViewModel };
export {
  buildLeadNeed,
  buildSalesActionCardViewModel,
  formatDisplayPhone,
  resolveSourceProvenance,
  stripInternalPollution,
  toTelUri,
} from './salesActionCardViewModel';

const TIMELINE_LABEL: Record<BuyingTimeline | string, string> = {
  buying_today: 'Trong hôm nay',
  within_7_days: 'Trong 7 ngày',
  within_30_days: 'Trong 30 ngày',
  researching: 'Đang tìm hiểu',
  long_term: 'Dài hạn',
  unknown: '',
};

const ROLE_LABEL: Record<LeadAlertRole, string> = {
  buyer: 'Người mua',
  tenant: 'Người thuê',
  investor: 'Nhà đầu tư',
};

/** Telegram callback_data ≤64 bytes — cuid (~25) fits with l:x: prefix. */
export function truncFindingIdForCallback(id: string, max = 48): string {
  return id.length <= max ? id : id.slice(0, max);
}

export function resolveLeadAlertRole(input: {
  intent?: BuyerIntentLabel | string | null;
  classification?: string | null;
  persona?: string | null;
  isBuyer?: boolean | null;
}): LeadAlertRole | null {
  const intent = String(input.intent || '').toLowerCase();
  const classification = String(input.classification || '').toLowerCase();
  const persona = String(input.persona || '').toLowerCase();
  const blob = `${intent} ${classification} ${persona}`;

  if (/\brenter\b|\brental\b|thuê/.test(blob) && !/cho\s*thuê|landlord/.test(blob)) {
    return 'tenant';
  }
  if (/\binvestor\b|đầu\s*tư/.test(blob)) return 'investor';
  if (
    input.isBuyer ||
    /\bbuyer\b|ready_buyer|warm_lead|potential_buyer|research_phase|demand/.test(blob)
  ) {
    return 'buyer';
  }
  return null;
}

export function formatBudgetLabel(
  budgetMin?: number | bigint | null,
  budgetMax?: number | bigint | null,
  expectedDealTy?: number | null,
  role?: LeadAlertRole | null,
): string | null {
  const bMin = normalizeTy(budgetMin);
  const bMax = normalizeTy(budgetMax);
  const unit = role === 'tenant' ? 'triệu/tháng' : null;

  if (role === 'tenant') {
    const rawMin = budgetMin != null ? Number(budgetMin) : null;
    const rawMax = budgetMax != null ? Number(budgetMax) : null;
    const toTrieu = (n: number) => (n >= 1000 ? Math.round(n / 1_000_000) : n);
    if (rawMin != null || rawMax != null) {
      if (rawMin != null && rawMax != null && rawMin === rawMax) {
        return `≤ ${toTrieu(rawMax)} ${unit}`;
      }
      if (rawMax != null && (rawMin == null || rawMin === 0)) {
        return `≤ ${toTrieu(rawMax)} ${unit}`;
      }
      const parts = [rawMin, rawMax]
        .filter((v): v is number => v != null)
        .map(v => `${toTrieu(v)}`);
      return parts.length ? `${parts.join('–')} ${unit}` : null;
    }
  }

  if (bMin != null || bMax != null) {
    if (bMin != null && bMax != null && Math.abs(bMin - bMax) < 0.05) {
      return `~${formatTy(bMin)}`;
    }
    const parts = [bMin, bMax].filter((v): v is number => v != null).map(v => formatTy(v));
    return parts.length ? parts.join('–') : null;
  }
  if (expectedDealTy != null && Number.isFinite(expectedDealTy)) {
    return `~${formatTy(expectedDealTy)}`;
  }
  return null;
}

export function formatAreaLabel(extractedData: unknown): string | null {
  if (!extractedData || typeof extractedData !== 'object' || Array.isArray(extractedData)) {
    return null;
  }
  const root = extractedData as Record<string, unknown>;
  const area =
    (root.area as Record<string, unknown> | undefined) ||
    ((root.analysis as Record<string, unknown> | undefined)?.area as
      | Record<string, unknown>
      | undefined);
  if (!area || typeof area !== 'object') return null;
  const min =
    typeof area.areaMinM2 === 'number'
      ? area.areaMinM2
      : typeof area.areaMin === 'number'
        ? area.areaMin
        : null;
  const max =
    typeof area.areaMaxM2 === 'number'
      ? area.areaMaxM2
      : typeof area.areaMax === 'number'
        ? area.areaMax
        : null;
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} m²`;
  return `${min ?? max} m²`;
}

/** @deprecated Prefer resolveSourceProvenance → label */
export function formatSourceLabel(input: {
  sourceName?: string | null;
  sourceType?: string | null;
  extractedData?: unknown;
  canonicalUrl?: string | null;
}): string | null {
  return resolveSourceProvenance({
    extractedData: input.extractedData,
    agentSourceName: input.sourceName,
    agentSourceType: input.sourceType,
    canonicalUrl: input.canonicalUrl,
  }).label;
}

export function buildLeadCenterUrl(findingId: string): string | null {
  const raw =
    process.env.PUBLIC_SITE_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    process.env.AGENT_SYNC_VPS_URL ||
    '';
  const base = String(raw).trim().replace(/\/$/, '');
  if (!base || !/^https?:\/\//i.test(base)) return null;
  return `${base}/admin/agents/lead-center?findingId=${encodeURIComponent(findingId)}`;
}

export function buildActionableRecommendation(input: {
  recommendation: SalesRecommendation;
  propertyType?: string | null;
  location?: string | null;
  budgetLabel?: string | null;
  timelineLabel?: string | null;
  hasPhone?: boolean;
  heatScore?: number;
  role?: LeadAlertRole | null;
}): string {
  const verb = input.role === 'tenant' ? 'thuê' : input.role === 'investor' ? 'đầu tư' : 'mua';
  const need = [
    input.propertyType ? `${verb} ${input.propertyType}` : null,
    input.location || null,
    input.budgetLabel
      ? input.role === 'tenant'
        ? `giá ${input.budgetLabel}`
        : `ngân sách ${input.budgetLabel}`
      : null,
    input.timelineLabel ? `timeline ${input.timelineLabel}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const code = input.recommendation.code;
  let head = input.recommendation.label;
  if (code === 'call_now') {
    head = input.hasPhone ? 'Gọi ngay' : 'Inbox ngay';
  } else if (code === 'send_quote') {
    head = 'Gửi 3 sản phẩm phù hợp';
  } else if (code === 'reply_comment') {
    head = 'Trả lời comment / hỏi thêm nhu cầu';
  } else if (code === 'follow_up') {
    head = 'Follow-up trong 24h';
  } else if (code === 'remarket') {
    head = 'Đưa vào remarketing';
  } else if (code === 'assign') {
    head = input.hasPhone ? 'Gọi và giao sales xử lý' : 'Giao sales — hỏi lại ngân sách';
  } else if (code === 'monitor') {
    head =
      (input.heatScore ?? 50) < 40
        ? 'Chưa nên liên hệ — tín hiệu chưa đủ mạnh'
        : 'Theo dõi thêm tín hiệu';
  }

  if (need) return `${head} — khách đang cần ${need}.`;
  if (input.recommendation.reason) return `${head} — ${input.recommendation.reason}`;
  return head;
}

/** @deprecated Prefer buildLeadNeed */
export function summarizeSignal(input: {
  title?: string | null;
  needSummary?: string | null;
  summary?: string | null;
  reasons?: string[];
  role?: LeadAlertRole;
  propertyType?: string | null;
  location?: string | null;
}): string | null {
  return buildLeadNeed({
    role: input.role || 'buyer',
    title: input.title,
    needSummary: input.needSummary,
    summary: input.summary,
    propertyType: input.propertyType,
    location: input.location,
    intentReasons: input.reasons,
  });
}

function humanizePropertyType(raw?: string | null): string | null {
  if (!raw) return null;
  const t = String(raw).trim().toLowerCase();
  if (!t || t === 'unknown') return null;
  const map: Record<string, string> = {
    land: 'đất nền',
    dat: 'đất nền',
    'dat nen': 'đất nền',
    house: 'nhà phố',
    'nha pho': 'nhà phố',
    apartment: 'căn hộ',
    'can ho': 'căn hộ',
    villa: 'biệt thự',
    shophouse: 'shophouse',
    hotel: 'khách sạn',
    rental: 'nhà thuê',
    home_buyer: 'nhà ở',
    first_home: 'nhà ở',
    upgrader: 'nhà ở',
    investor: 'bất động sản đầu tư',
    business: 'mặt bằng KD',
    developer: 'dự án',
  };
  if (map[t]) return map[t];
  return String(raw).replace(/_/g, ' ').trim();
}

function mapAcquisitionAction(acq?: LeadAcquisitionProfile | null): SalesRecommendation {
  const action = acq?.action?.action;
  const reason = acq?.action?.reason || 'Lead candidate';
  if (action === 'call' || action === 'inbox') {
    return {
      code: 'call_now',
      label: action === 'call' ? 'Gọi ngay' : 'Inbox ngay',
      reason,
      urgency: 'urgent',
    };
  }
  if (action === 'comment') {
    return { code: 'reply_comment', label: 'Trả lời comment / nurture', reason, urgency: 'soon' };
  }
  if (action === 'ignore') {
    return {
      code: 'monitor',
      label: 'Chưa nên liên hệ — tín hiệu chưa đủ mạnh',
      reason,
      urgency: 'low',
    };
  }
  if (action === 'monitor') {
    return { code: 'monitor', label: 'Theo dõi thêm tín hiệu', reason, urgency: 'low' };
  }
  if (action === 'crm') {
    return { code: 'follow_up', label: 'Follow-up trong 24h', reason, urgency: 'soon' };
  }
  return {
    code: 'assign',
    label: 'Giao sales — hỏi lại ngân sách',
    reason,
    urgency: 'normal',
  };
}

export type SalesActionCardInput = {
  findingId: string;
  actorName?: string | null;
  propertyType?: string | null;
  location?: string | null;
  budgetMin?: number | bigint | null;
  budgetMax?: number | bigint | null;
  areaLabel?: string | null;
  timeline?: BuyingTimeline | string | null;
  campaignName?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  needSummary?: string | null;
  summary?: string | null;
  whyReasons?: string[];
  hasPhone?: boolean;
  phone?: string | null;
  acquisition?: LeadAcquisitionProfile | null;
  sales?: SalesLayerProfile | null;
  confidencePct?: number | null;
  role?: LeadAlertRole | null;
  classification?: string | null;
  extractedData?: unknown;
  agentSourceName?: string | null;
  agentSourceType?: string | null;
  /** Pre-built view model (preferred) */
  viewModel?: SalesActionCardViewModel | null;
};

export function formatSalesActionCard(input: SalesActionCardInput): string {
  const role =
    input.role ||
    resolveLeadAlertRole({
      intent: input.acquisition?.intent.intent,
      classification: input.classification,
      persona: input.acquisition?.persona.persona,
      isBuyer: input.acquisition?.isBuyer,
    }) ||
    'buyer';

  const propertyType =
    input.propertyType ||
    input.acquisition?.campaignMatch.propertyHint ||
    (input.acquisition?.persona.persona !== 'unknown' ? input.acquisition?.persona.persona : null) ||
    null;
  const propertyDisplay = humanizePropertyType(propertyType);

  const budgetLabel = formatBudgetLabel(
    input.budgetMin,
    input.budgetMax,
    input.sales?.expectedDealTy ?? null,
    role,
  );

  const recommendation: SalesRecommendation = input.sales?.recommendation
    ? input.sales.recommendation
    : mapAcquisitionAction(input.acquisition);

  const timelineKey = input.timeline || input.acquisition?.timeline || null;
  const timelineLbl =
    timelineKey && TIMELINE_LABEL[timelineKey] !== undefined
      ? TIMELINE_LABEL[timelineKey]
      : timelineKey && timelineKey !== 'unknown'
        ? String(timelineKey)
        : null;

  const confidencePct = resolveBuyerConfidencePct({
    salesConfidencePct: input.confidencePct ?? null,
    acquisitionFinalScore: input.acquisition?.priority.finalScore ?? null,
    intentConfidence: input.acquisition?.intent.confidence ?? null,
  });

  const nextAction = buildActionableRecommendation({
    recommendation,
    propertyType: propertyDisplay,
    location: input.location,
    budgetLabel,
    timelineLabel: timelineLbl,
    hasPhone: input.hasPhone || Boolean(input.phone),
    heatScore: confidencePct,
    role,
  });

  const vm =
    input.viewModel ||
    buildSalesActionCardViewModel({
      findingId: input.findingId,
      role,
      confidencePct,
      acquisition: input.acquisition,
      sales: input.sales,
      propertyType: propertyDisplay,
      location: input.location,
      budgetLabel,
      timeline: input.timeline,
      title: input.title,
      needSummary: input.needSummary,
      summary: input.summary,
      phone: input.phone,
      extractedData: input.extractedData,
      agentSourceName: input.agentSourceName,
      agentSourceType: input.agentSourceType,
      canonicalUrl: input.sourceUrl,
      nextAction,
      intentReasons: input.whyReasons,
      classification: input.classification,
    });

  // Prefer explicit sourceLabel only when not polluted; else VM provenance
  const sourceLabel =
    (input.sourceLabel &&
    !/h2\.|unify-lead-alert/i.test(input.sourceLabel) &&
    stripInternalPollution(input.sourceLabel)) ||
    vm.sourceLabel;

  const heat = vm.heat.emoji ? vm.heat : classifyBuyerHeat(vm.confidence);
  const lines: string[] = [
    '🎯 LEAD ALERT',
    '═══════════════════',
    '',
    `${heat.emoji} ${heat.label}`.trim(),
    '',
    `👤 ${ROLE_LABEL[vm.role]}`,
  ];

  const actor = (input.actorName && stripInternalPollution(input.actorName)) || null;
  if (actor) lines.push(`🗣 ${actor}`);

  if (vm.location) lines.push(`📍 ${vm.location}`);
  if (vm.budget) lines.push(`💰 ${vm.budget}`);
  if (vm.propertyType) lines.push(`🏠 ${vm.propertyType}`);
  if (vm.timeline) lines.push(`⏱ ${vm.timeline}`);

  if (vm.leadNeed) {
    lines.push('', '📌 Need', vm.leadNeed);
  }
  if (vm.phone) {
    lines.push('', '📞 Phone', vm.phone);
  }
  if (sourceLabel) {
    lines.push('', '📂 Source', sourceLabel);
  }

  lines.push('', `🎯 BUYER CONFIDENCE: ${vm.confidence}%`);
  lines.push('', '💡 NEXT ACTION', vm.nextAction || nextAction);
  lines.push('', '═══════════════════');

  return lines.join('\n');
}

export function salesActionCardKeyboard(input: {
  findingId: string;
  sourceUrl?: string | null;
  leadCenterUrl?: string | null;
  hasPhone?: boolean;
  phone?: string | null;
}): InlineKeyboard {
  const id = truncFindingIdForCallback(input.findingId);
  const rows: InlineKeyboard['inline_keyboard'] = [];

  // Telegram Bot API rejects tel: URLs on inline buttons ("Wrong port number").
  // Call always uses callback → opsLeadCall returns phone + tel URI in confirmation.
  rows.push([
    { text: '📞 Call', callback_data: `l:k:${id}` },
    { text: '💬 Contact', callback_data: `l:t:${id}` },
  ]);

  const mid: InlineKeyboard['inline_keyboard'][number] = [];
  if (input.leadCenterUrl && /^https:\/\//i.test(input.leadCenterUrl)) {
    mid.push({ text: '👤 Open Lead', url: input.leadCenterUrl });
  } else {
    mid.push({ text: '👤 Open Lead', callback_data: `l:n:${id}` });
  }
  if (input.sourceUrl && /^https:\/\//i.test(input.sourceUrl)) {
    mid.push({ text: '🔗 Source', url: input.sourceUrl });
  } else {
    mid.push({ text: '🔗 Source', callback_data: `l:u:${id}` });
  }
  rows.push(mid);

  rows.push([
    { text: '👥 Assign', callback_data: `l:a:${id}` },
    { text: '📜 History', callback_data: `l:h:${id}` },
  ]);
  rows.push([{ text: '🚫 Ignore', callback_data: `l:s:${id}` }]);

  return { inline_keyboard: rows };
}

/** Owner picker after Assign click */
export function assignOwnerKeyboard(input: {
  findingId: string;
  owners: Array<{ id: string; label: string }>;
}): InlineKeyboard {
  const fid = truncFindingIdForCallback(input.findingId, 28);
  const rows: InlineKeyboard['inline_keyboard'] = [];
  for (const owner of input.owners.slice(0, 8)) {
    const oid = truncFindingIdForCallback(owner.id, 28);
    const data = `l:w:${fid}:${oid}`;
    if (data.length > 64) continue;
    rows.push([{ text: `👤 ${owner.label.slice(0, 40)}`, callback_data: data }]);
  }
  if (!rows.length) {
    rows.push([{ text: '👤 Self', callback_data: `l:w:${fid}:self` }]);
  }
  return { inline_keyboard: rows };
}

/** @deprecated Use formatSalesActionCard */
export function formatSalesBuyerCard(input: {
  profile: SalesLayerProfile;
  confidencePct: number;
  campaignName?: string | null;
  title?: string | null;
}): string {
  return formatSalesActionCard({
    findingId: input.profile.findingId,
    sales: input.profile,
    confidencePct: input.confidencePct,
    campaignName: input.campaignName,
    title: input.title,
  });
}

/** @deprecated Use salesActionCardKeyboard */
export function salesBuyerCardKeyboard(input: {
  findingId: string;
  openUrl?: string | null;
}): InlineKeyboard {
  return salesActionCardKeyboard({
    findingId: input.findingId,
    sourceUrl: input.openUrl,
    leadCenterUrl: buildLeadCenterUrl(input.findingId),
  });
}
