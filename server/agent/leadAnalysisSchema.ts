/**
 * Lead analysis JSON schema + validation (Lead Intelligence).
 */

import {
  ACTOR_ROLES,
  LEAD_CLASSIFICATIONS,
  LEAD_INTENTS,
  actorRoleFromClassification,
  isLeadClassification,
  normalizeActorRole,
  normalizeClassification,
  normalizeIntent,
  type ActorRole,
  type LeadClassification,
  type LeadIntent,
} from './leadIntelligence';

export { LEAD_CLASSIFICATIONS, LEAD_INTENTS, ACTOR_ROLES };
export type { LeadClassification, LeadIntent, ActorRole };

export const LEAD_URGENCIES = ['low', 'medium', 'high'] as const;
export type LeadUrgency = (typeof LEAD_URGENCIES)[number];

export const DEMAND_TYPES = ['buyer', 'renter', 'investor', 'none'] as const;
export const SUPPLY_TYPES = ['seller', 'landlord', 'broker_listing', 'none'] as const;
export const REPRESENTED_DEMANDS = ['buyer', 'renter', 'investor', 'none', 'unknown'] as const;
export const BROKER_ACTIVITIES = [
  'demand_request',
  'supply_listing',
  'recruitment',
  'unknown',
] as const;
export type DemandType = (typeof DEMAND_TYPES)[number];
export type SupplyType = (typeof SUPPLY_TYPES)[number];
export type RepresentedDemand = (typeof REPRESENTED_DEMANDS)[number];
export type BrokerActivity = (typeof BROKER_ACTIVITIES)[number];

export interface LeadAnalysisContact {
  phone?: string;
  email?: string;
  facebookUrl?: string;
}

export interface LeadAnalysisResult {
  classification: LeadClassification;
  intent: LeadIntent;
  actorRole: ActorRole;
  demandType: DemandType;
  supplyType: SupplyType;
  representedDemand: RepresentedDemand;
  brokerActivity: BrokerActivity;
  confidence: number;
  /** AI clarity / suitability score 0–100 (not keyword score) */
  score: number;
  region: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  propertyTypes: string[];
  urgency: LeadUrgency;
  contact: LeadAnalysisContact;
  /** Short AI title ≤90 chars */
  title: string;
  /** 1–2 sentence lead value summary — must not copy title */
  summary: string;
  reasons: string[];
  recommendedAction?: string | null;
  replySuggestion?: string | null;
  risks?: string[];
  missingInformation?: string[];
  domainClassification?: string | null;
  primaryTransactionObject?: {
    raw?: string | null;
    category?: string | null;
    normalizedType?: string | null;
  } | null;
  isRealEstateRelevant?: boolean | null;
  realEstateRelevanceReason?: string | null;
}

export interface LeadAnalysisMeta {
  source: 'ai' | 'fallback';
  prefilterScore?: number;
  model?: string;
  provider?: string;
  promptVersion?: string;
  analyzedAt: string;
  degradedQuota?: boolean;
  degradedDetail?: string;
}

export function isLeadUrgency(value: string): value is LeadUrgency {
  return (LEAD_URGENCIES as readonly string[]).includes(value);
}

function clamp01(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

function clampScore(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function nullableString(value: unknown, maxLen = 200): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.slice(0, maxLen);
}

function stringArray(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item).trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseContact(value: unknown): LeadAnalysisContact {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const contact: LeadAnalysisContact = {};
  const phone = nullableString(raw.phone, 30);
  const email = nullableString(raw.email, 120);
  const facebookUrl = nullableString(raw.facebookUrl, 300);
  if (phone) contact.phone = phone;
  if (email) contact.email = email;
  if (facebookUrl) contact.facebookUrl = facebookUrl;
  return contact;
}

function normalizeDemandType(value: unknown, classification: LeadClassification): DemandType {
  const raw = String(value || '').toLowerCase().trim();
  if ((DEMAND_TYPES as readonly string[]).includes(raw)) return raw as DemandType;
  if (classification === 'buyer' || classification === 'renter' || classification === 'investor') {
    return classification;
  }
  return 'none';
}

function normalizeSupplyType(value: unknown, classification: LeadClassification): SupplyType {
  const raw = String(value || '').toLowerCase().trim();
  if ((SUPPLY_TYPES as readonly string[]).includes(raw)) return raw as SupplyType;
  if (classification === 'seller') return 'seller';
  if (classification === 'landlord') return 'landlord';
  if (classification === 'broker') return 'broker_listing';
  return 'none';
}

function normalizeRepresentedDemand(
  value: unknown,
  classification: LeadClassification,
): RepresentedDemand {
  const raw = String(value || '').toLowerCase().trim();
  if ((REPRESENTED_DEMANDS as readonly string[]).includes(raw)) return raw as RepresentedDemand;
  if (classification === 'buyer' || classification === 'renter' || classification === 'investor') {
    return classification;
  }
  return classification === 'unknown' ? 'unknown' : 'none';
}

function normalizeBrokerActivity(value: unknown): BrokerActivity {
  const raw = String(value || 'unknown').toLowerCase().trim();
  return (BROKER_ACTIVITIES as readonly string[]).includes(raw)
    ? (raw as BrokerActivity)
    : 'unknown';
}

export function validateLeadAnalysis(raw: unknown): LeadAnalysisResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Lead analysis phải là object JSON.');
  }

  const data = raw as Record<string, unknown>;
  const classification = normalizeClassification(data.classification);
  let actorRole = normalizeActorRole(data.actorRole);
  if (actorRole === 'unknown') {
    actorRole = actorRoleFromClassification(classification);
  }

  const intent = normalizeIntent(data.intent);
  const urgency = String(data.urgency || 'low').toLowerCase();
  const title =
    nullableString(data.title, 90) ||
    nullableString(data.summary, 90) ||
    'Lead signal';
  const summary = nullableString(data.summary, 600) ?? '';

  return {
    classification,
    intent,
    actorRole,
    demandType: normalizeDemandType(data.demandType, classification),
    supplyType: normalizeSupplyType(data.supplyType, classification),
    representedDemand: normalizeRepresentedDemand(data.representedDemand, classification),
    brokerActivity: normalizeBrokerActivity(data.brokerActivity),
    confidence: clamp01(data.confidence),
    score: clampScore(data.score),
    region: nullableString(data.region, 120),
    budgetMin: nullableNumber(data.budgetMin),
    budgetMax: nullableNumber(data.budgetMax),
    areaMin: nullableNumber(data.areaMin),
    areaMax: nullableNumber(data.areaMax),
    propertyTypes: stringArray(data.propertyTypes),
    urgency: isLeadUrgency(urgency) ? urgency : 'low',
    contact: parseContact(data.contact),
    title,
    summary,
    reasons: stringArray(data.reasons, 20),
    recommendedAction: nullableString(data.recommendedAction, 300),
    replySuggestion: nullableString(data.replySuggestion, 500),
    risks: stringArray(data.risks, 10),
    missingInformation: stringArray(data.missingInformation, 12),
    domainClassification: nullableString(data.domainClassification, 40),
    primaryTransactionObject: parsePrimaryTransactionObject(data.primaryTransactionObject),
    isRealEstateRelevant:
      typeof data.isRealEstateRelevant === 'boolean' ? data.isRealEstateRelevant : null,
    realEstateRelevanceReason: nullableString(data.realEstateRelevanceReason, 300),
  };
}

function parsePrimaryTransactionObject(
  value: unknown,
): LeadAnalysisResult['primaryTransactionObject'] {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    raw: nullableString(raw.raw, 120),
    category: nullableString(raw.category, 40),
    normalizedType: nullableString(raw.normalizedType, 60),
  };
}

export function extractJsonPayload(text: string): string {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return cleaned.slice(first, last + 1);
  }
  return cleaned;
}

export function parseLeadAnalysisJson(text: string): LeadAnalysisResult {
  const primary = extractJsonPayload(text);
  try {
    return validateLeadAnalysis(JSON.parse(primary));
  } catch {
    const repaired = primary.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    return validateLeadAnalysis(JSON.parse(repaired));
  }
}

export function tryParseLeadAnalysisJson(
  text: string,
): { ok: true; data: LeadAnalysisResult } | { ok: false; error: string } {
  try {
    return { ok: true, data: parseLeadAnalysisJson(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'JSON không hợp lệ',
    };
  }
}

export function mergeAnalysisMeta(
  result: LeadAnalysisResult,
  meta: LeadAnalysisMeta,
): Record<string, unknown> {
  return {
    ...result,
    analysisMeta: meta,
  };
}

export { isLeadClassification };
