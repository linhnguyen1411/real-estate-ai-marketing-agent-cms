export const LEAD_CLASSIFICATIONS = [
  'buyer',
  'renter',
  'seller',
  'broker',
  'spam',
  'unknown',
] as const;

export const LEAD_INTENTS = ['buy', 'rent', 'sell', 'service', 'unknown'] as const;

export const LEAD_URGENCIES = ['low', 'medium', 'high'] as const;

export type LeadClassification = (typeof LEAD_CLASSIFICATIONS)[number];
export type LeadIntent = (typeof LEAD_INTENTS)[number];
export type LeadUrgency = (typeof LEAD_URGENCIES)[number];

export interface LeadAnalysisContact {
  phone?: string;
  email?: string;
  facebookUrl?: string;
}

export interface LeadAnalysisResult {
  classification: LeadClassification;
  intent: LeadIntent;
  confidence: number;
  score: number;
  region: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  propertyTypes: string[];
  urgency: LeadUrgency;
  contact: LeadAnalysisContact;
  summary: string;
  reasons: string[];
}

export interface LeadAnalysisMeta {
  source: 'ai' | 'fallback';
  prefilterScore?: number;
  model?: string;
  analyzedAt: string;
}

export function isLeadClassification(value: string): value is LeadClassification {
  return (LEAD_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function isLeadIntent(value: string): value is LeadIntent {
  return (LEAD_INTENTS as readonly string[]).includes(value);
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

export function validateLeadAnalysis(raw: unknown): LeadAnalysisResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Lead analysis phải là object JSON.');
  }

  const data = raw as Record<string, unknown>;
  const classification = String(data.classification || 'unknown').toLowerCase();
  const intent = String(data.intent || 'unknown').toLowerCase();
  const urgency = String(data.urgency || 'low').toLowerCase();

  return {
    classification: isLeadClassification(classification) ? classification : 'unknown',
    intent: isLeadIntent(intent) ? intent : 'unknown',
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
    summary: nullableString(data.summary, 600) ?? '',
    reasons: stringArray(data.reasons, 20),
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
    const repaired = primary
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
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
