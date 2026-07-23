/**
 * Intent Detection Engine — Rule + Intent Pattern + Classifier.
 * Does NOT depend on Gemini.
 */

import type { BuyerIntentLabel, IntentDetectionResult } from './types';

type PatternRule = {
  intent: BuyerIntentLabel;
  label: string;
  weight: number;
  re: RegExp;
};

const INTENT_PATTERNS: PatternRule[] = [
  // Ready buyer
  { intent: 'ready_buyer', label: 'hỏi vay', weight: 28, re: /hỏi\s*vay|vay\s*ngân\s*hàng|duyệt\s*vay|sẵn\s*tiền\s*mặt|cash\s*sẵn/i },
  { intent: 'ready_buyer', label: 'chốt nhanh', weight: 26, re: /chốt\s*nhanh|cọc\s*ngay|xem\s*nhà\s*hôm\s*nay|đi\s*xem\s*luôn/i },
  // Buyer
  { intent: 'buyer', label: 'cần mua', weight: 30, re: /cần\s*mua|tìm\s*mua|muốn\s*mua/i },
  { intent: 'buyer', label: 'mua nhà/đất', weight: 22, re: /mua\s*nhà|mua\s*đất|mua\s*lô/i },
  { intent: 'buyer', label: 'tìm nhà', weight: 24, re: /tìm\s*nhà|tìm\s*đất|tìm\s*lô|cần\s*tìm\s*(nhà|đất|lô|căn)/i },
  { intent: 'buyer', label: 'khách cần', weight: 22, re: /khách\s*cần\s*(tìm|mua)|khách\s*mua/i },
  // Investor
  { intent: 'investor', label: 'đầu tư', weight: 24, re: /đầu\s*tư|cashflow|dòng\s*tiền|sinh\s*lời|roi/i },
  // Warm
  { intent: 'warm_lead', label: 'nên mua', weight: 18, re: /nên\s*mua|có\s*nên\s*mua|đáng\s*mua|mua\s*có\s*lời/i },
  { intent: 'warm_lead', label: 'quan tâm', weight: 14, re: /quan\s*tâm|muốn\s*biết\s*giá|xin\s*giá|cho\s*hỏi\s*giá/i },
  // Potential
  { intent: 'potential_buyer', label: 'ai biết', weight: 12, re: /ai\s*biết|ai\s*có\s*(nhà|đất|lô)|cho\s*xin\s*info|xin\s*info/i },
  { intent: 'potential_buyer', label: 'tìm hiểu', weight: 10, re: /tìm\s*hiểu|tham\s*khảo|xem\s*thử/i },
  // Research
  { intent: 'research_phase', label: 'hỏi pháp lý', weight: 16, re: /pháp\s*lý|sổ\s*đỏ|sổ\s*hồng|quy\s*hoạch|giấy\s*tờ/i },
  { intent: 'research_phase', label: 'so sánh', weight: 12, re: /so\s*sánh|khu\s*nào\s*tốt|nên\s*chọn/i },
  // Renter
  { intent: 'renter', label: 'cần thuê', weight: 26, re: /cần\s*thuê|tìm\s*thuê|muốn\s*thuê/i },
  // Non-buyer supply
  { intent: 'non_buyer', label: 'cần bán', weight: 30, re: /cần\s*bán|bán\s*nhà|bán\s*đất|chính\s*chủ\s*bán|cho\s*thuê(?!\s*không)/i },
];

const INTENT_RANK: BuyerIntentLabel[] = [
  'ready_buyer',
  'buyer',
  'investor',
  'warm_lead',
  'potential_buyer',
  'research_phase',
  'renter',
  'non_buyer',
  'unknown',
];

export function detectBuyerIntent(text: string): IntentDetectionResult {
  const hay = String(text || '');
  const hits: Array<{ intent: BuyerIntentLabel; label: string; weight: number }> = [];
  for (const p of INTENT_PATTERNS) {
    if (p.re.test(hay)) hits.push({ intent: p.intent, label: p.label, weight: p.weight });
  }

  if (!hits.length) {
    return {
      intent: 'unknown',
      confidence: 0.2,
      matchedPatterns: [],
      reasons: ['no_intent_pattern'],
    };
  }

  const scoreByIntent = new Map<BuyerIntentLabel, number>();
  for (const h of hits) {
    scoreByIntent.set(h.intent, (scoreByIntent.get(h.intent) || 0) + h.weight);
  }

  let best: BuyerIntentLabel = 'unknown';
  let bestScore = -1;
  for (const intent of INTENT_RANK) {
    const s = scoreByIntent.get(intent) || 0;
    if (s > bestScore) {
      bestScore = s;
      best = intent;
    }
  }

  // Supply dominates demand if both fire hard
  const supply = scoreByIntent.get('non_buyer') || 0;
  const demand =
    (scoreByIntent.get('buyer') || 0) +
    (scoreByIntent.get('ready_buyer') || 0) +
    (scoreByIntent.get('investor') || 0);
  if (supply >= 30 && supply > demand) best = 'non_buyer';

  // "nên mua" = warm advisory, not hard buyer — unless explicit need signals also present
  const hasNenMua = hits.some(h => h.label === 'nên mua');
  const hasHardBuyer = hits.some(
    h => h.intent === 'buyer' && ['cần mua', 'tìm nhà', 'khách cần'].includes(h.label),
  );
  if (hasNenMua && !hasHardBuyer && (scoreByIntent.get('warm_lead') || 0) >= 14) {
    best = 'warm_lead';
  }

  const confidence = Math.max(0.25, Math.min(0.98, (scoreByIntent.get(best) || bestScore) / 60));
  return {
    intent: best,
    confidence,
    matchedPatterns: hits.filter(h => h.intent === best || h.weight >= 18).map(h => h.label),
    reasons: hits.slice(0, 6).map(h => `${h.intent}:${h.label}`),
  };
}

export function isBuyerIntent(intent: BuyerIntentLabel): boolean {
  return (
    intent === 'buyer' ||
    intent === 'ready_buyer' ||
    intent === 'warm_lead' ||
    intent === 'potential_buyer' ||
    intent === 'research_phase' ||
    intent === 'investor'
  );
}
