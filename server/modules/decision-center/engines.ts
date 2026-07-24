/**
 * Phase 2–6 — Rule / Weight / Intent / Campaign / Decision (no LLM).
 */

import { hashNormalizedText, normalizeLeadText } from './normalize';
import type {
  CampaignRuleMatch,
  DecisionIntent,
  DecisionOutcome,
  DecisionRule,
  LeadDecisionResult,
  MatchedRuleHit,
} from './types';

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function matchRules(normalized: string, rules: DecisionRule[]): MatchedRuleHit[] {
  const hits: MatchedRuleHit[] = [];
  const enabled = rules.filter(r => r.enabled).sort((a, b) => a.priority - b.priority);
  for (const rule of enabled) {
    const kw = rule.keyword.trim().toLowerCase();
    if (!kw) continue;
    if (normalized.includes(kw)) {
      hits.push({
        id: rule.id,
        keyword: rule.keyword,
        weight: rule.weight,
        category: rule.category,
        group: rule.group,
      });
    }
  }
  return hits;
}

export function computeRuleScore(hits: MatchedRuleHit[]): number {
  const raw = hits.reduce((sum, h) => sum + h.weight, 0);
  // Baseline 20 when any buyer/signal hit so mid-band can reach AI review
  const hasPositive = hits.some(h => h.weight > 0);
  const base = hasPositive ? 20 : 0;
  return clampScore(base + raw);
}

export function detectDecisionIntent(hits: MatchedRuleHit[]): {
  intent: DecisionIntent;
  confidence: number;
} {
  const score: Record<DecisionIntent, number> = {
    buyer: 0,
    seller: 0,
    broker: 0,
    investor: 0,
    research: 0,
    rent: 0,
    spam: 0,
    unknown: 0,
  };

  for (const h of hits) {
    if (h.category === 'buyer' || (h.category === 'signal' && h.weight > 0)) score.buyer += Math.abs(h.weight);
    if (h.category === 'seller') score.seller += Math.abs(h.weight);
    if (h.category === 'broker') score.broker += Math.abs(h.weight);
    if (h.category === 'investor') score.investor += Math.abs(h.weight);
    if (h.category === 'research') score.research += Math.abs(h.weight);
    if (h.category === 'rent') score.rent += Math.abs(h.weight);
    if (h.category === 'spam') score.spam += Math.abs(h.weight);
    if (h.category === 'negative' && /thuê|bán|tuyển/.test(h.keyword)) {
      if (h.keyword.includes('thuê')) score.rent += Math.abs(h.weight);
      else if (h.keyword.includes('tuyển')) score.spam += Math.abs(h.weight);
      else score.seller += Math.abs(h.weight);
    }
  }

  const order: DecisionIntent[] = [
    'spam',
    'seller',
    'broker',
    'rent',
    'buyer',
    'investor',
    'research',
    'unknown',
  ];
  let best: DecisionIntent = 'unknown';
  let bestScore = 0;
  for (const intent of order) {
    if (score[intent] > bestScore) {
      bestScore = score[intent];
      best = intent;
    }
  }
  if (bestScore <= 0) return { intent: 'unknown', confidence: 0.15 };
  const confidence = Math.min(0.98, 0.35 + bestScore / 120);
  return { intent: best, confidence };
}

export function matchCampaign(
  normalized: string,
  campaignMap: Array<{ keyword: string; campaignName: string }>,
): CampaignRuleMatch | null {
  for (const row of campaignMap) {
    const kw = row.keyword.trim().toLowerCase();
    if (kw && normalized.includes(kw)) {
      return {
        campaignKey: kw.replace(/\s+/g, '_'),
        campaignName: row.campaignName,
        matchedKeyword: row.keyword,
        weight: 20,
      };
    }
  }
  return null;
}

export function decideOutcome(input: {
  ruleScore: number;
  intent: DecisionIntent;
}): { decision: DecisionOutcome; aiAllowed: boolean; reason: string } {
  const { ruleScore, intent } = input;

  if (intent === 'spam' || ruleScore < 40) {
    return {
      decision: 'discard',
      aiAllowed: false,
      reason: intent === 'spam' ? 'spam_intent' : `rule_score_${ruleScore}_lt_40`,
    };
  }

  // Seller/broker/rent are not buyer candidates — discard or manual
  if (intent === 'seller' || intent === 'broker') {
    if (ruleScore >= 60) {
      return { decision: 'manual_review', aiAllowed: false, reason: `${intent}_manual` };
    }
    return { decision: 'discard', aiAllowed: false, reason: `${intent}_discard` };
  }

  if (ruleScore >= 80) {
    return {
      decision: 'qualified_candidate',
      aiAllowed: false,
      reason: `rule_score_${ruleScore}_gte_80_no_ai`,
    };
  }
  if (ruleScore >= 60) {
    return {
      decision: 'ai_review',
      aiAllowed: true,
      reason: `rule_score_${ruleScore}_ai_review`,
    };
  }
  if (ruleScore >= 40) {
    return {
      decision: 'manual_review',
      aiAllowed: false,
      reason: `rule_score_${ruleScore}_manual`,
    };
  }
  return { decision: 'discard', aiAllowed: false, reason: `rule_score_${ruleScore}_discard` };
}

export function evaluateLeadDecision(input: {
  text: string;
  rules: DecisionRule[];
  campaignMap: Array<{ keyword: string; campaignName: string }>;
  cached?: LeadDecisionResult | null;
}): LeadDecisionResult {
  const normalizedText = normalizeLeadText(input.text);
  const contentHash = hashNormalizedText(normalizedText);

  if (input.cached && input.cached.contentHash === contentHash) {
    return {
      ...input.cached,
      cacheHit: true,
      aiUsed: false,
      at: new Date().toISOString(),
    };
  }

  const matchedRules = matchRules(normalizedText, input.rules);
  const ruleScore = computeRuleScore(matchedRules);
  const { intent, confidence } = detectDecisionIntent(matchedRules);
  const campaign = matchCampaign(normalizedText, input.campaignMap);
  const outcome = decideOutcome({ ruleScore, intent });

  const reasons = [
    outcome.reason,
    ...matchedRules.slice(0, 8).map(h => `${h.weight >= 0 ? '+' : ''}${h.weight}:${h.keyword}`),
    campaign ? `campaign:${campaign.campaignName}` : '',
  ].filter(Boolean);

  return {
    version: 'h36_decision_v1',
    contentHash,
    normalizedText,
    ruleScore,
    intent,
    intentConfidence: confidence,
    matchedRules,
    campaign,
    decision: outcome.decision,
    aiAllowed: outcome.aiAllowed,
    aiUsed: false,
    cacheHit: false,
    reason: outcome.reason,
    reasons,
    at: new Date().toISOString(),
  };
}
