/**
 * H3.6.1 — Knowledge Base & Self-Learning Rule Engine
 * Knowledge → compiled Rules → Decision Engine
 * Does not touch Runtime / Fleet / Execution Agent / Browser / Scheduler /
 * Publisher / Scanner / Campaign Runtime / Task Orchestrator /
 * Lead Acquisition / Sales Layer.
 */

export * from './types';
export { DEFAULT_KNOWLEDGE_CONCEPTS } from './defaultConcepts';
export {
  compileRulesFromKnowledge,
  compileCampaignMapFromKnowledge,
  collectKnownTerms,
} from './compile';
export {
  listConcepts,
  upsertConcept,
  deleteConcept,
  mergeConcepts,
  importConcepts,
  resetConceptsToDefault,
  exportKnowledgeLibrary,
  listUnknownTerms,
  listSuggestions,
  mapUnknownTerm,
  ignoreUnknownTerm,
  resolveSuggestion,
  getKnowledgeHealth,
  getRuleCoverage,
  recordCoverageEvent,
} from './store';
export {
  observeTextForKnowledge,
  learnFromLeadCorrection,
  learnFromAdminRule,
  proposeFromAiEnrichment,
} from './learning';
export {
  getCompiledDecisionRules,
  getCompiledCampaignMap,
  buildKnowledgeSnapshot,
  formatKnowledgeReport,
  getKnowledgeReportText,
} from './knowledgeService';
export {
  recordRuleDecisionEvent,
  recordRuleConversion,
  recordFalseNegative,
  bumpLearningEvent,
} from './analyticsStore';
export {
  buildKnowledgeAnalytics,
  formatKnowledgeHealthBriefing,
} from './analyticsEngine';
export type {
  RuleRoiLabel,
  RuleStat,
  LocationStat,
  SourceStat,
  MissionStat,
  RuleAnalyticsRow,
  OptimizerRecommendation,
  KnowledgeScorecard,
  KnowledgeAnalyticsSnapshot,
} from './analyticsTypes';
export {
  applyOutcomeFeedback,
  buildFeedbackCenterSnapshot,
  formatWeeklyEvolution,
} from './feedbackEngine';
export type {
  FeedbackOutcome,
  FeedbackEvent,
  FeedbackCenterSnapshot,
  WeeklyEvolutionSummary,
} from './feedbackTypes';
export { registerKnowledgeBaseRoutes } from './api/knowledgeRoutes';
