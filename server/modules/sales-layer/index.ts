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
  probabilityForStage,
} from './pipelineValue';
export { applyLearningAdjustments } from './learningAdjust';
export {
  processSalesLayer,
  enqueueSalesLayer,
  updateSalesPipelineStage,
  recordSalesLearning,
  listSalesPipeline,
  getSalesPipelineMetrics,
  formatSalesDailyBriefing,
  readSalesProfile,
  writeSalesProfile,
} from './salesService';
export {
  formatSalesBuyerCard,
  salesBuyerCardKeyboard,
  maybeSendCoolingAlert,
} from './telegramSalesCard';
export { registerSalesLayerRoutes } from './api/salesRoutes';
