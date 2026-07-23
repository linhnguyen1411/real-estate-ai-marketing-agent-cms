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

export function computeRuleScore(input: {
  keywordScore: number;
  leadFitScore: number;
  demandSignalCount?: number;
  hasPhone?: boolean;
}): number {
  const kw = clamp(input.keywordScore);
  const fit = clamp(input.leadFitScore);
  const demandBoost = Math.min(40, (input.demandSignalCount || 0) * 12);
  let score = Math.round(0.55 * Math.max(fit, demandBoost || 0) + 0.45 * Math.max(kw, demandBoost));
  if (input.hasPhone) score += 8;
  if (demandBoost > 0 && score < 35) score = 35;
  if (kw >= 40 && score < 30) score = 30;
  return clamp(score);
}

/**
 * finalScore = Rule Score + AI Score blend (never AI-only).
 * - If ruleScore provided: use it (with optional AI blend).
 * - Else legacy: hard-zero when !targetMatched || leadFit<=0.
 */
export function computeIntelligenceFinalScore(input: {
  leadFitScore: number;
  aiScore: number | null;
  keywordScore: number;
  targetMatched: boolean;
  /** Prefer explicit rule score from Rule Engine */
  ruleScore?: number | null;
}): number {
  if (input.ruleScore != null) {
    const rule = clamp(input.ruleScore);
    if (input.aiScore == null) return rule;
    return clamp(Math.round(0.55 * rule + 0.45 * clamp(input.aiScore)));
  }

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
