/**
 * Shared buyer heat — used by Sales Layer + Telegram Buyer Alert gate.
 * Not Telegram-specific; score is 0–100 buyer confidence.
 */

export type BuyerHeat = 'hot' | 'warm' | 'cold' | 'skip';

export type BuyerHeatInfo = {
  heat: BuyerHeat;
  score: number;
  label: string;
  emoji: string;
  shouldAlert: boolean;
};

/** Canonical display score (single metric for sales card). */
export function clampBuyerConfidence(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Resolve one BUYER CONFIDENCE score from available real metrics.
 * Prefer Sales Layer confidence; else acquisition finalScore; else intent confidence.
 */
export function resolveBuyerConfidencePct(input: {
  salesConfidencePct?: number | null;
  acquisitionFinalScore?: number | null;
  intentConfidence?: number | null;
}): number {
  if (input.salesConfidencePct != null && Number.isFinite(input.salesConfidencePct)) {
    return clampBuyerConfidence(input.salesConfidencePct);
  }
  if (input.acquisitionFinalScore != null && Number.isFinite(input.acquisitionFinalScore)) {
    return clampBuyerConfidence(input.acquisitionFinalScore);
  }
  if (input.intentConfidence != null && Number.isFinite(input.intentConfidence)) {
    return clampBuyerConfidence(input.intentConfidence * 100);
  }
  return 0;
}

export function classifyBuyerHeat(score: number): BuyerHeatInfo {
  const s = clampBuyerConfidence(score);
  if (s >= 80) {
    return { heat: 'hot', score: s, label: 'HOT', emoji: '🔥', shouldAlert: true };
  }
  if (s >= 60) {
    return { heat: 'warm', score: s, label: 'WARM', emoji: '🟡', shouldAlert: true };
  }
  if (s >= 40) {
    return { heat: 'cold', score: s, label: 'COLD', emoji: '⚪', shouldAlert: true };
  }
  return { heat: 'skip', score: s, label: 'SKIP', emoji: '', shouldAlert: false };
}

export function shouldSendBuyerAlert(score: number): boolean {
  return classifyBuyerHeat(score).shouldAlert;
}
