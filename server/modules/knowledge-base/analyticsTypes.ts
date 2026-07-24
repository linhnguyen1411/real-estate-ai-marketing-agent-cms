/**
 * Knowledge Analytics & Rule Optimizer types (measure only — no new rules / no AI).
 */

export type RuleRoiLabel = 'excellent' | 'high' | 'medium' | 'low' | 'dead';

export type RuleStat = {
  keyword: string;
  category: string;
  conceptId: string | null;
  conceptName: string;
  matched: number;
  qualified: number;
  converted: number;
  falsePositive: number;
  lastMatchedAt: string | null;
  firstSeenAt: string;
};

export type LocationStat = {
  key: string;
  label: string;
  matched: number;
  qualified: number;
  won: number;
};

export type SourceStat = {
  sourceId: string;
  label: string;
  scanned: number;
  qualified: number;
  converted: number;
};

export type MissionStat = {
  missionId: string;
  label: string;
  keyword: string;
  buyer: number;
  won: number;
};

export type RuleAnalyticsRow = RuleStat & {
  accuracy: number;
  roi: RuleRoiLabel;
  status: 'active' | 'unused' | 'dead' | 'false_positive' | 'needs_tune';
};

export type OptimizerRecommendation = {
  id: string;
  kind: 'archive' | 'reduce_weight' | 'add_synonym' | 'review_source' | 'boost_source';
  title: string;
  detail: string;
  target: string;
  priority: number;
};

export type KnowledgeScorecard = {
  coverage: number;
  accuracy: number;
  freshness: number;
  approvalRate: number;
  learningRate: number;
  overall: number;
};

export type KnowledgeAnalyticsSnapshot = {
  version: 'h361_analytics_v1';
  score: KnowledgeScorecard;
  topRules: RuleAnalyticsRow[];
  unusedRules: RuleAnalyticsRow[];
  deadRules: RuleAnalyticsRow[];
  falsePositives: RuleAnalyticsRow[];
  falseNegatives: Array<{ term: string; count: number; suggestedConcept: string; at: string }>;
  topContributors: Array<{ keyword: string; sharePercent: number; qualified: number }>;
  locations: LocationStat[];
  sources: Array<SourceStat & { roi: RuleRoiLabel; recommendation: string }>;
  missions: Array<MissionStat & { roi: RuleRoiLabel }>;
  recommendations: OptimizerRecommendation[];
  coverage: {
    scanned: number;
    ruleMatchPercent: number;
    discardPercent: number;
    unknownPercent: number;
  };
  totals: {
    rulesTracked: number;
    matchedTotal: number;
    qualifiedTotal: number;
    convertedTotal: number;
    deadCount: number;
    unknownCount: number;
  };
};
