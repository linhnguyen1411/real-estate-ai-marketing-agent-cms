import type { SourceRecommendation } from './types';

export type SourceQualityInput = {
  leads: number;
  buyers: number;
  qualified: number;
  investor: number;
  tenant: number;
  duplicateRate: number;
  dismissedRate: number;
  scanSuccessRate: number;
  scanFailureRate: number;
  freshnessHours: number | null;
};

export type SourceQualityResult = {
  qualityScore: number;
  recommendation: SourceRecommendation;
  recommendationReason: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function score01(v: number): number {
  return clamp(v, 0, 1);
}

/**
 * Deterministic source quality score (0-100), no AI model.
 * Weights:
 * - buyer yield 30%
 * - qualified yield 20%
 * - investor/tenant yield 10%
 * - freshness 15%
 * - scan success 15%
 * - duplicate+dismiss penalty 10%
 */
export function evaluateSourceQuality(input: SourceQualityInput): SourceQualityResult {
  const leads = Math.max(0, input.leads);
  const buyers = Math.max(0, input.buyers);
  const qualified = Math.max(0, input.qualified);
  const investorTenant = Math.max(0, input.investor + input.tenant);

  const buyerYield = leads > 0 ? buyers / leads : 0;
  const qualifiedYield = leads > 0 ? qualified / leads : 0;
  const investorTenantYield = leads > 0 ? investorTenant / leads : 0;

  const freshnessScore =
    input.freshnessHours == null
      ? 0
      : input.freshnessHours <= 1
        ? 1
        : input.freshnessHours <= 6
          ? 0.9
          : input.freshnessHours <= 24
            ? 0.75
            : input.freshnessHours <= 72
              ? 0.45
              : 0.15;

  const successScore = score01((input.scanSuccessRate - input.scanFailureRate * 0.5) / 100);
  const penalty =
    score01(input.duplicateRate / 100) * 0.7 + score01(input.dismissedRate / 100) * 0.3;
  const reliabilityScore = 1 - penalty;

  const score =
    buyerYield * 100 * 0.3 +
    qualifiedYield * 100 * 0.2 +
    investorTenantYield * 100 * 0.1 +
    freshnessScore * 100 * 0.15 +
    successScore * 100 * 0.15 +
    reliabilityScore * 100 * 0.1;

  const qualityScore = Math.round(clamp(score, 0, 100));

  let recommendation: SourceRecommendation = 'KEEP';
  if (qualityScore >= 90) recommendation = 'PRIORITIZE';
  else if (qualityScore >= 75) recommendation = 'KEEP';
  else if (qualityScore >= 55) recommendation = 'REDUCE';
  else if (qualityScore >= 35) recommendation = 'PAUSE';
  else recommendation = 'DELETE';

  const recommendationReason =
    `buyer=${(buyerYield * 100).toFixed(1)}%` +
    ` qualified=${(qualifiedYield * 100).toFixed(1)}%` +
    ` dup=${input.duplicateRate.toFixed(1)}%` +
    ` fail=${input.scanFailureRate.toFixed(1)}%` +
    ` freshness=${input.freshnessHours == null ? 'n/a' : `${input.freshnessHours.toFixed(1)}h`}`;

  return {
    qualityScore,
    recommendation,
    recommendationReason,
  };
}
