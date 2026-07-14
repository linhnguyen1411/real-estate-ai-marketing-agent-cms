/**
 * Lead Intelligence classification / scoring helpers (buyer-first).
 */

export const LEAD_CLASSIFICATIONS = [
  'buyer',
  'renter',
  'investor',
  'seller',
  'landlord',
  'broker',
  'service',
  'discussion',
  'spam',
  'unknown',
] as const;

export const LEAD_INTENTS = [
  'buy',
  'rent',
  'invest',
  'sell',
  'lease_out',
  'service',
  'unknown',
] as const;

export const ACTOR_ROLES = ['demand_side', 'supply_side', 'broker', 'unknown'] as const;

export type LeadClassification = (typeof LEAD_CLASSIFICATIONS)[number];
export type LeadIntent = (typeof LEAD_INTENTS)[number];
export type ActorRole = (typeof ACTOR_ROLES)[number];

export const DEFAULT_TARGET_CLASSIFICATIONS: LeadClassification[] = [
  'buyer',
  'renter',
  'investor',
];

export const DEFAULT_EXCLUDED_CLASSIFICATIONS: LeadClassification[] = [
  'seller',
  'landlord',
  'broker',
  'spam',
  'discussion',
  'unknown',
];

export const INTELLIGENCE_VERSION = 'lead-intelligence@v1';

export function isLeadClassification(value: unknown): value is LeadClassification {
  return LEAD_CLASSIFICATIONS.includes(String(value || '') as LeadClassification);
}

export function normalizeClassification(value: unknown): LeadClassification {
  const raw = String(value || 'unknown').toLowerCase().trim();
  return isLeadClassification(raw) ? raw : 'unknown';
}

export function normalizeIntent(value: unknown): LeadIntent {
  const raw = String(value || 'unknown').toLowerCase().trim();
  return (LEAD_INTENTS as readonly string[]).includes(raw)
    ? (raw as LeadIntent)
    : 'unknown';
}

export function normalizeActorRole(value: unknown): ActorRole {
  const raw = String(value || 'unknown').toLowerCase().trim();
  return (ACTOR_ROLES as readonly string[]).includes(raw) ? (raw as ActorRole) : 'unknown';
}

/** Infer actor role from classification when AI omitted it. */
export function actorRoleFromClassification(classification: LeadClassification): ActorRole {
  if (classification === 'buyer' || classification === 'renter' || classification === 'investor') {
    return 'demand_side';
  }
  if (classification === 'seller' || classification === 'landlord') return 'supply_side';
  if (classification === 'broker') return 'broker';
  return 'unknown';
}

export function computeLeadFitScore(input: {
  classification: LeadClassification;
  actorRole: ActorRole;
  targetClassifications: LeadClassification[];
  hasPhone: boolean;
  hasBudget: boolean;
  hasLocation: boolean;
  hasPropertyType: boolean;
  urgency?: string | null;
}): number {
  if (!input.targetClassifications.includes(input.classification)) return 0;
  if (input.actorRole === 'supply_side' || input.actorRole === 'broker') return 0;

  let score = 55;
  if (input.hasPhone) score += 15;
  if (input.hasBudget) score += 12;
  if (input.hasLocation) score += 10;
  if (input.hasPropertyType) score += 5;
  const urgency = String(input.urgency || '').toLowerCase();
  if (urgency === 'high' || urgency === 'urgent') score += 3;
  return Math.min(100, score);
}

/**
 * finalScore = 55% leadFit + 35% ai + 10% keyword (normalized).
 * Hard gate: classification must be in target (caller checks); otherwise return 0.
 */
export function computeIntelligenceFinalScore(input: {
  leadFitScore: number;
  aiScore: number | null;
  keywordScore: number;
  targetMatched: boolean;
}): number {
  if (!input.targetMatched || input.leadFitScore <= 0) return 0;
  const ai = input.aiScore == null ? input.leadFitScore : clamp(input.aiScore);
  const kw = clamp(input.keywordScore);
  const fit = clamp(input.leadFitScore);
  return clamp(Math.round(0.55 * fit + 0.35 * ai + 0.1 * kw));
}

export function priorityFromScore(finalScore: number, hasPhone: boolean): 'hot' | 'warm' | 'cool' {
  if (finalScore >= 80 || (finalScore >= 70 && hasPhone)) return 'hot';
  if (finalScore >= 55) return 'warm';
  return 'cool';
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

export function bigIntOrNull(value: unknown): bigint | null {
  if (value == null || value === '') return null;
  if (typeof value === 'bigint') return value;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.floor(n));
}

export function moneyToNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
