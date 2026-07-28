/**
 * H2.4.5 — Sales Action Card ViewModel + provenance helpers.
 * Business-facing data only. Campaign/mission/task/trace never render.
 */

import type { BuyingTimeline, BuyerIntentLabel, LeadAcquisitionProfile } from '../lead-acquisition/types';
import type { SalesLayerProfile } from './types';
import { classifyBuyerHeat, resolveBuyerConfidencePct, type BuyerHeatInfo } from './buyerHeat';

export type LeadAlertRole = 'buyer' | 'tenant' | 'investor';

/** Internal / campaign markers that must never appear on Sales card copy. */
const POLLUTION_RE =
  /\b(?:h\d+(?:\.\d+)*[-_][\w-]+|unify-lead-alert|finding[_-]?id|lead[_-]?id|mission[_-]?id|task[_-]?id|trace[_-]?id|campaign[_-]?id|cms\w{20,}|tmp[-_]|probe[-_]|test[-_]campaign)\b/gi;

export type SalesActionCardViewModel = {
  findingId: string;
  leadId: string | null;
  role: LeadAlertRole;
  confidence: number;
  heat: BuyerHeatInfo;
  propertyType: string | null;
  location: string | null;
  budget: string | null;
  timeline: string | null;
  leadNeed: string | null;
  phone: string | null;
  telUri: string | null;
  sourcePlatform: string | null;
  sourceType: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  nextAction: string | null;
  owner: string | null;
  /** Internal only — never render on card */
  campaignContext: string | null;
};

export function stripInternalPollution(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let text = String(raw).replace(POLLUTION_RE, ' ');
  // Drop leftover campaign-like tokens with digits/dots (e.g. "h2.4.4-unify…")
  text = text.replace(/\bh\d+(?:\.\d+)+(?:[-_][\w-]+)*/gi, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text || null;
}

export function looksLikeInternalLabel(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = String(value).trim();
  if (!v) return false;
  return (
    /\b(?:h\d+(?:\.\d+)*[-_][\w-]+|unify-lead-alert|finding[_-]?id|lead[_-]?id|mission[_-]?id|task[_-]?id|trace[_-]?id|campaign[_-]?id|cms\w{20,}|tmp[-_]|probe[-_]|test[-_]campaign)\b/i.test(
      v,
    ) ||
    /\bh\d+\.\d+/i.test(v) ||
    /unify-lead-alert/i.test(v) ||
    /^test\b/i.test(v)
  );
}

/** VN phone → tel:+84… ; keep leading 0 semantics via +84 strip. */
export function normalizeVnPhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const raw = String(phone).trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('84') && digits.length >= 11) return digits;
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 11) {
    return `84${digits.slice(1)}`;
  }
  if (digits.length === 9 || digits.length === 10) return `84${digits}`;
  return null;
}

export function toTelUri(phone: string | null | undefined): string | null {
  const digits = normalizeVnPhoneDigits(phone);
  if (!digits) return null;
  return `tel:+${digits}`;
}

export function formatDisplayPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  return trimmed || null;
}

type SourceMeta = {
  platform: string | null;
  type: string | null;
  name: string | null;
  url: string | null;
};

function readExtractedSource(extractedData: unknown): {
  groupName?: string;
  groupUrl?: string;
  postUrl?: string;
  platform?: string;
  sourceName?: string;
} {
  if (!extractedData || typeof extractedData !== 'object' || Array.isArray(extractedData)) {
    return {};
  }
  const root = extractedData as Record<string, unknown>;
  const src =
    root.source && typeof root.source === 'object' && !Array.isArray(root.source)
      ? (root.source as Record<string, unknown>)
      : {};
  return {
    groupName: typeof src.groupName === 'string' ? src.groupName : undefined,
    groupUrl: typeof src.groupUrl === 'string' ? src.groupUrl : undefined,
    postUrl: typeof src.postUrl === 'string' ? src.postUrl : undefined,
    platform: typeof src.platform === 'string' ? src.platform : undefined,
    sourceName: typeof src.sourceName === 'string' ? src.sourceName : undefined,
  };
}

/**
 * Source = where the lead was discovered (post/group), NOT campaign.
 */
export function resolveSourceProvenance(input: {
  extractedData?: unknown;
  agentSourceName?: string | null;
  agentSourceType?: string | null;
  canonicalUrl?: string | null;
}): SourceMeta & { label: string | null } {
  const ed = readExtractedSource(input.extractedData);
  const agentName = (input.agentSourceName || '').trim();
  const agentType = (input.agentSourceType || '').trim().toLowerCase();

  const nameCandidate =
    ed.groupName ||
    ed.sourceName ||
    (!looksLikeInternalLabel(agentName) ? agentName : null) ||
    null;

  const name = nameCandidate ? stripInternalPollution(nameCandidate) : null;

  let platform: string | null = ed.platform || null;
  if (!platform) {
    if (agentType.includes('facebook') || agentType.includes('group')) platform = 'Facebook';
    else if (agentType.includes('web')) platform = 'Website';
    else if (agentType) platform = agentType;
    else if (name) platform = 'Facebook';
  }
  if (platform && /facebook/i.test(platform)) platform = 'Facebook';

  let type: string | null = null;
  if (agentType.includes('group') || ed.groupName) type = 'group_post';
  else if (agentType) type = agentType;

  const url =
    (input.canonicalUrl && /^https:\/\//i.test(input.canonicalUrl) ? input.canonicalUrl : null) ||
    (ed.postUrl && /^https:\/\//i.test(ed.postUrl) ? ed.postUrl : null) ||
    null;

  let label: string | null = null;
  if (platform && name) label = `${platform} · ${name}`;
  else if (name) label = name;
  else if (platform) label = platform;

  return { platform, type, name, url, label };
}

const TIMELINE_LABEL: Record<string, string> = {
  buying_today: 'Trong hôm nay',
  within_7_days: 'Trong 7 ngày',
  within_30_days: 'Trong 30 ngày',
  researching: 'Đang tìm hiểu',
  long_term: 'Dài hạn',
  unknown: '',
};

function composeNeedFromFacts(input: {
  role: LeadAlertRole;
  propertyType?: string | null;
  location?: string | null;
}): string | null {
  const verb = input.role === 'tenant' ? 'thuê' : input.role === 'investor' ? 'đầu tư' : 'mua';
  const prop = (input.propertyType || '').trim();
  const loc = (input.location || '').trim();
  if (!prop && !loc) return null;
  const parts = [`Cần ${verb}`, prop || null, loc || null].filter(Boolean);
  return parts.join(' ');
}

/**
 * 📌 Need = lead intent only. Never campaign/mission/task/trace.
 */
export function buildLeadNeed(input: {
  role: LeadAlertRole;
  title?: string | null;
  needSummary?: string | null;
  summary?: string | null;
  propertyType?: string | null;
  location?: string | null;
  intentReasons?: string[];
}): string | null {
  // Prefer structured facts — avoids campaign/marker pollution in free text.
  const composed = composeNeedFromFacts({
    role: input.role,
    propertyType: input.propertyType,
    location: input.location,
  });
  if (composed) return composed;

  const candidates = [
    input.needSummary,
    input.title,
    input.summary,
    ...(input.intentReasons || []).slice(0, 2),
  ];

  for (const c of candidates) {
    const cleaned = stripInternalPollution(c);
    if (!cleaned) continue;
    if (looksLikeInternalLabel(cleaned)) continue;

    const m = cleaned.match(
      /cần\s+(?:mua|thuê|đầu\s*tư)\s+[^,.;\n]{3,80}?(?=\s*(?:,|ngân\s*sách|giá|gọi|ib|liên\s*hệ|$))/i,
    );
    if (m) {
      const clause = m[0].replace(/\s+/g, ' ').trim();
      return clause.length > 140 ? `${clause.slice(0, 137)}…` : clause;
    }

    if (/cần\s*(mua|thuê|đầu\s*tư)|muốn\s*(mua|thuê)|tìm\s*(mua|thuê|nhà|đất)/i.test(cleaned)) {
      return cleaned.length > 140 ? `${cleaned.slice(0, 137)}…` : cleaned;
    }
  }

  for (const c of candidates) {
    const cleaned = stripInternalPollution(c);
    if (cleaned && !looksLikeInternalLabel(cleaned)) {
      return cleaned.length > 140 ? `${cleaned.slice(0, 137)}…` : cleaned;
    }
  }
  return null;
}

export function timelineLabel(timeline?: BuyingTimeline | string | null): string | null {
  if (!timeline || timeline === 'unknown') return null;
  if (TIMELINE_LABEL[timeline] !== undefined) {
    return TIMELINE_LABEL[timeline] || null;
  }
  return String(timeline);
}

export function buildSalesActionCardViewModel(input: {
  findingId: string;
  leadId?: string | null;
  role: LeadAlertRole;
  confidencePct?: number | null;
  acquisition?: LeadAcquisitionProfile | null;
  sales?: SalesLayerProfile | null;
  propertyType?: string | null;
  location?: string | null;
  budgetLabel?: string | null;
  timeline?: BuyingTimeline | string | null;
  title?: string | null;
  needSummary?: string | null;
  summary?: string | null;
  phone?: string | null;
  extractedData?: unknown;
  agentSourceName?: string | null;
  agentSourceType?: string | null;
  canonicalUrl?: string | null;
  nextAction?: string | null;
  intentReasons?: string[];
  classification?: string | null;
  intent?: BuyerIntentLabel | string | null;
}): SalesActionCardViewModel {
  const confidence = resolveBuyerConfidencePct({
    salesConfidencePct: input.confidencePct ?? null,
    acquisitionFinalScore: input.acquisition?.priority.finalScore ?? null,
    intentConfidence: input.acquisition?.intent.confidence ?? null,
  });
  const heat = classifyBuyerHeat(confidence);
  const source = resolveSourceProvenance({
    extractedData: input.extractedData,
    agentSourceName: input.agentSourceName,
    agentSourceType: input.agentSourceType,
    canonicalUrl: input.canonicalUrl,
  });
  const propertyType = input.propertyType || null;
  const location = input.location ? stripInternalPollution(input.location) : null;
  const leadNeed = buildLeadNeed({
    role: input.role,
    title: input.title,
    needSummary: input.needSummary,
    summary: input.summary,
    propertyType,
    location,
    intentReasons: input.intentReasons || input.acquisition?.intent.reasons,
  });
  const phone = formatDisplayPhone(input.phone);
  const campaignName = input.acquisition?.campaignMatch.campaignName || null;

  return {
    findingId: input.findingId,
    leadId: input.leadId || null,
    role: input.role,
    confidence,
    heat,
    propertyType,
    location,
    budget: input.budgetLabel || null,
    timeline: timelineLabel(input.timeline || input.acquisition?.timeline),
    leadNeed,
    phone,
    telUri: toTelUri(phone),
    sourcePlatform: source.platform,
    sourceType: source.type,
    sourceName: source.name,
    sourceUrl: source.url,
    sourceLabel: source.label,
    nextAction: input.nextAction || null,
    owner: input.sales?.owner || null,
    campaignContext: campaignName && !looksLikeInternalLabel(campaignName) ? campaignName : null,
  };
}

/** Assert card text has no internal leakage (tests). */
export function assertCardHasNoInternalLeakage(cardText: string): string[] {
  const leaks: string[] = [];
  if (/h2\.4\.4-unify-lead-alert/i.test(cardText)) leaks.push('campaign_marker');
  if (/findingId|leadId|missionId|taskId|traceId/i.test(cardText)) leaks.push('id_token');
  if (/\bmission\b|\btask\b|\btrace\b/i.test(cardText) && /id[=:]/i.test(cardText)) {
    leaks.push('internal_id');
  }
  return leaks;
}
