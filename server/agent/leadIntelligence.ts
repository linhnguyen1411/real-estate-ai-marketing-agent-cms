/**
 * Lead Intelligence classification / scoring helpers (buyer-first).
 * Enums live in shared/agent-domain; scoring helpers stay server-side.
 */

export {
  LEAD_CLASSIFICATIONS,
  LEAD_INTENTS,
  ACTOR_ROLES,
  LEAD_INTELLIGENCE_CLASSIFICATIONS,
  LEAD_INTELLIGENCE_INTENTS,
  LEAD_INTELLIGENCE_ACTOR_ROLES,
  DEFAULT_TARGET_CLASSIFICATIONS,
  DEFAULT_EXCLUDED_CLASSIFICATIONS,
  INTELLIGENCE_VERSION,
  isLeadClassification,
  isLeadIntelligenceClassification,
  isLeadIntelligenceIntent,
  isLeadIntelligenceActorRole,
  normalizeClassification,
  normalizeIntent,
  normalizeActorRole,
  actorRoleFromClassification,
  type LeadClassification,
  type LeadIntent,
  type ActorRole,
  type LeadIntelligenceClassification,
  type LeadIntelligenceIntent,
  type LeadIntelligenceActorRole,
} from '../../shared/agent-domain/leadIntelligence';

export function computeLeadFitScore(input: {
  classification: string;
  actorRole: string;
  targetClassifications: string[];
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
