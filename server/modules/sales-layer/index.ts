/**
 * H3.5 — Buyer Journey Engine + Sales Pipeline Intelligence
 * Lead = start · Closed = goal. Sales Layer only.
 */

export * from './types';
export { detectJourneyStage, journeyToPipeline, migrateH3PipelineStage } from './journeyEngine';
export { computeBuyerKey, findSiblingFindings } from './leadMemory';
export { buildSignal, mergeSignals, scoreBuyerFromSignals, inferSignalKind } from './signalGraph';
export { evaluateFollowUp } from './followUpEngine';
export { recommendSalesAction } from './salesRecommendation';
export {
  aggregatePipelineValue,
  estimateDealTy,
  formatTy,
  normalizeTy,
  probabilityForStage,
} from './pipelineValue';
export { applyLearningAdjustments } from './learningAdjust';
export {
  processSalesLayer,
  enqueueSalesLayer,
  updateSalesPipelineStage,
  recordSalesLearning,
  recordSalesAction,
  listSalesPipeline,
  getSalesPipelineMetrics,
  formatSalesDailyBriefing,
  readSalesProfile,
  writeSalesProfile,
  getUrgentBuyersBundle,
  listUrgentBuyers,
  loadPipelineSalesRows,
} from './salesService';
export type { SalesActionKind } from './salesService';
export {
  formatUrgentBuyersListText,
  urgentBuyersListKeyboard,
  dailyBriefingSalesKeyboard,
  selectUrgentBuyers,
  toUrgentBuyerSummary,
  isUrgentSalesProfile,
  URGENT_BUYERS_PAGE_SIZE,
} from './urgentBuyers';
export type { UrgentBuyerSummary, PipelineSalesRow } from './urgentBuyers';
export {
  formatSalesBuyerCard,
  formatSalesActionCard,
  salesBuyerCardKeyboard,
  salesActionCardKeyboard,
  assignOwnerKeyboard,
  maybeSendCoolingAlert,
  buildLeadCenterUrl,
  formatBudgetLabel,
  formatAreaLabel,
  formatSourceLabel,
  buildActionableRecommendation,
  buildLeadNeed,
  buildSalesActionCardViewModel,
  resolveSourceProvenance,
  resolveLeadSource,
  validateSourceProvenance,
  isTrustedContentUrl,
  looksLikeConfigSourceName,
  toTelUri,
  stripInternalPollution,
} from './telegramSalesCard';
export { resolveLeadAlertRole } from './telegramSalesActionCard';
export type { LeadAlertRole, SalesActionCardViewModel } from './telegramSalesActionCard';
export {
  classifyBuyerHeat,
  resolveBuyerConfidencePct,
  shouldSendBuyerAlert,
  clampBuyerConfidence,
} from './buyerHeat';
export type { BuyerHeat, BuyerHeatInfo } from './buyerHeat';
export { learnFromIgnoredFinding, loadDecisionKnowledge, lookupDecisionPenalty, getDecisionLearningMetrics, decisionScorePenalty, shouldRejectLead, shouldSuppressTelegram } from './ignoreLearnService';
export type { IgnoreReason, DecisionEntry, DecisionKnowledgeState } from './ignoreLearnService';
export { registerSalesLayerRoutes } from './api/salesRoutes';
