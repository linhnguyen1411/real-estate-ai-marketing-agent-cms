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
} from './salesService';
export type { SalesActionKind } from './salesService';
export {
  formatSalesBuyerCard,
  formatSalesActionCard,
  salesBuyerCardKeyboard,
  salesActionCardKeyboard,
  maybeSendCoolingAlert,
  buildLeadCenterUrl,
  formatBudgetLabel,
  formatAreaLabel,
  formatSourceLabel,
  buildActionableRecommendation,
} from './telegramSalesCard';
export { resolveLeadAlertRole } from './telegramSalesActionCard';
export type { LeadAlertRole } from './telegramSalesActionCard';
export {
  classifyBuyerHeat,
  resolveBuyerConfidencePct,
  shouldSendBuyerAlert,
  clampBuyerConfidence,
} from './buyerHeat';
export type { BuyerHeat, BuyerHeatInfo } from './buyerHeat';
export { registerSalesLayerRoutes } from './api/salesRoutes';
