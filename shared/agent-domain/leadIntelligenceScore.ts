/**
 * Score / analysis status enums for Lead Intelligence.
 */

export const LEAD_INTELLIGENCE_SCORE_STATUSES = [
  'scored',
  'provisional',
  'needs_review',
  'failed',
  'not_analyzed',
] as const;

export type LeadIntelligenceScoreStatus = (typeof LEAD_INTELLIGENCE_SCORE_STATUSES)[number];

/** UI analysis lifecycle for a finding display */
export type AnalysisStatus =
  | 'analyzed'
  | 'partial'
  | 'needs_review'
  | 'not_analyzed'
  | 'inconsistent'
  | 'failed';

/**
 * Historical ScoreStatus used by resolver (subset of LeadIntelligenceScoreStatus).
 * Prefer LeadIntelligenceScoreStatus for new code.
 */
export type ScoreStatus = 'scored' | 'provisional' | 'needs_review' | 'failed';

export function isLeadIntelligenceScoreStatus(
  value: unknown,
): value is LeadIntelligenceScoreStatus {
  return LEAD_INTELLIGENCE_SCORE_STATUSES.includes(
    String(value || '') as LeadIntelligenceScoreStatus,
  );
}

export function normalizeScoreStatus(value: unknown): LeadIntelligenceScoreStatus {
  const raw = String(value || 'not_analyzed').toLowerCase().trim();
  return isLeadIntelligenceScoreStatus(raw) ? raw : 'not_analyzed';
}
