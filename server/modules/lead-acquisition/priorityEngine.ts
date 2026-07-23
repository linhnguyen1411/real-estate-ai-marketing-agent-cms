/**
 * Lead Priority Engine — multi-signal Final Score (not AI-only).
 */

import { timelineScore } from './buyerTimeline';
import { isBuyerIntent } from './intentEngine';
import type {
  BuyingTimeline,
  CampaignMatchResult,
  IntentDetectionResult,
  PriorityBreakdown,
} from './types';

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeLeadPriority(input: {
  intent: IntentDetectionResult;
  timeline: BuyingTimeline;
  campaignMatch: CampaignMatchResult;
  keywordScore?: number | null;
  aiScore?: number | null;
  hasPhone?: boolean;
  hasBudget?: boolean;
  areaHint?: string | null;
  text?: string;
}): PriorityBreakdown {
  const text = String(input.text || '').toLowerCase();

  const urgency = clamp(
    input.intent.intent === 'ready_buyer'
      ? 95
      : input.intent.intent === 'buyer'
        ? 80
        : input.intent.intent === 'warm_lead'
          ? 60
          : input.intent.confidence * 100,
  );

  const budget = clamp(
    input.hasBudget
      ? 80
      : /\d+\s*(tỷ|ty|triệu|tr)\b/.test(text)
        ? 70
        : 35,
  );

  const areaMatch = clamp(
    input.areaHint && text.includes(String(input.areaHint).toLowerCase().slice(0, 12))
      ? 85
      : input.campaignMatch.matchScore >= 40
        ? 70
        : 40,
  );

  const campaignMatch = clamp(input.campaignMatch.matchScore);

  const activity = clamp(
    (input.hasPhone ? 25 : 0) +
      (/comment|inbox|ib\b|zalo|gọi/i.test(text) ? 30 : 0) +
      (input.intent.matchedPatterns.length * 8),
  );

  const buyingTimeline = timelineScore(input.timeline);

  const engagement = clamp(
    (/đã\s*(hỏi|comment|nhắn)|nhiều\s*lần|lần\s*\d/i.test(text) ? 75 : 40) +
      (input.intent.matchedPatterns.length > 2 ? 15 : 0),
  );

  const aiConfidence = clamp(
    input.aiScore != null
      ? input.aiScore
      : (input.keywordScore ?? 0) * 0.6 + input.intent.confidence * 40,
  );

  // Weighted final — buyer intents get floor boost
  let finalScore = clamp(
    0.18 * urgency +
      0.12 * budget +
      0.14 * areaMatch +
      0.16 * campaignMatch +
      0.1 * activity +
      0.14 * buyingTimeline +
      0.08 * engagement +
      0.08 * aiConfidence,
  );

  if (isBuyerIntent(input.intent.intent) && finalScore < 45) finalScore = 45;
  if (input.intent.intent === 'ready_buyer' && finalScore < 70) finalScore = 70;
  if (input.intent.intent === 'non_buyer') finalScore = Math.min(finalScore, 25);

  return {
    urgency,
    budget,
    areaMatch,
    campaignMatch,
    activity,
    buyingTimeline,
    engagement,
    aiConfidence,
    finalScore,
  };
}
