/**
 * H3.6 — Rule-first Lead Decision Engine
 * Does not touch Runtime / Fleet / Execution Agent / Browser / Scheduler /
 * Publisher / Campaign Runtime / Task Orchestrator / Sales Layer.
 */

export type RuleCategory =
  | 'buyer'
  | 'seller'
  | 'broker'
  | 'rent'
  | 'spam'
  | 'location'
  | 'signal'
  | 'campaign'
  | 'negative'
  | 'investor'
  | 'research';

export type DecisionOutcome =
  | 'qualified_candidate'
  | 'ai_review'
  | 'manual_review'
  | 'discard';

export type DecisionIntent =
  | 'buyer'
  | 'seller'
  | 'broker'
  | 'investor'
  | 'research'
  | 'rent'
  | 'spam'
  | 'unknown';

export type DecisionRule = {
  id: string;
  group: string;
  keyword: string;
  weight: number;
  category: RuleCategory;
  enabled: boolean;
  priority: number;
};

export type MatchedRuleHit = {
  id: string;
  keyword: string;
  weight: number;
  category: RuleCategory;
  group: string;
};

export type CampaignRuleMatch = {
  campaignKey: string;
  campaignName: string;
  matchedKeyword: string;
  weight: number;
};

export type LeadDecisionResult = {
  version: 'h36_decision_v1';
  contentHash: string;
  normalizedText: string;
  ruleScore: number;
  intent: DecisionIntent;
  intentConfidence: number;
  matchedRules: MatchedRuleHit[];
  campaign: CampaignRuleMatch | null;
  decision: DecisionOutcome;
  aiAllowed: boolean;
  aiUsed: boolean;
  cacheHit: boolean;
  reason: string;
  reasons: string[];
  at: string;
};

export type DecisionMetrics = {
  scanned: number;
  discarded: number;
  rulePassed: number;
  aiReviewed: number;
  qualified: number;
  converted: number;
  manualReview: number;
  cacheHits: number;
  aiSavingPercent: number;
  updatedAt: string;
};

export type DecisionCenterSnapshot = {
  version: 'h36_decision_v1';
  metrics: DecisionMetrics;
  rules: DecisionRule[];
  recent: Array<{
    findingId: string;
    title: string;
    ruleScore: number;
    intent: DecisionIntent;
    decision: DecisionOutcome;
    aiUsed: boolean;
    reason: string;
    matchedRules: string[];
    at: string;
  }>;
};
