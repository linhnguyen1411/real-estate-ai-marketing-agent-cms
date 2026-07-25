/**
 * H3.6 — Rule-first Lead Decision Engine
 * Scanner → Decision Engine → Candidate → AI (optional) → Lead
 * Does not touch Runtime / Fleet / Execution Agent / Browser / Scheduler /
 * Publisher / Campaign Runtime / Task Orchestrator / Sales Layer.
 */

export * from './types';
export { normalizeLeadText, hashNormalizedText } from './normalize';
export {
  evaluateLeadDecision,
  matchRules,
  computeRuleScore,
  detectDecisionIntent,
  matchCampaign,
  decideOutcome,
} from './engines';
export {
  processFindingDecision,
  evaluateTextDecision,
  markDecisionAiUsed,
  readDecisionProfile,
  buildDecisionSnapshot,
  formatDecisionReport,
  getDecisionReportText,
} from './decisionService';
export {
  listDecisionRules,
  upsertDecisionRule,
  deleteDecisionRule,
  importDecisionRules,
  exportDecisionLibrary,
  resetDecisionRulesToDefault,
  getDecisionMetrics,
  getRecentDecisions,
  getCampaignMap,
} from './store';
export { registerDecisionCenterRoutes } from './api/decisionCenterRoutes';
