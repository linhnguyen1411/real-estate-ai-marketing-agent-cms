/**
 * H3 — Lead Acquisition Engine
 * Scanner = input · Buyer lead = output
 * Does not touch Runtime / Fleet / Scheduler / Browser / Publisher / Task Orchestrator / Campaign Runtime.
 */

export * from './types';
export { detectBuyerIntent, isBuyerIntent } from './intentEngine';
export { classifyBuyerPersona } from './personaEngine';
export { predictBuyingTimeline, timelineScore } from './buyerTimeline';
export { matchLeadToCampaign } from './campaignMatcher';
export { computeLeadPriority } from './priorityEngine';
export { suggestLeadAction } from './actionEngine';
export { recordLeadLearning } from './learningEngine';
export {
  processLeadAcquisition,
  enqueueLeadAcquisition,
  updateLeadPipelineStage,
  listLeadPipeline,
  getLeadAcquisitionMetrics,
  readAcquisitionProfile,
  writeAcquisitionProfile,
} from './acquisitionService';
export {
  formatBuyerAlertText,
  buyerAlertKeyboard,
  maybeSendBuyerAlert,
} from './telegramBuyerAlert';
export { registerLeadAcquisitionRoutes } from './api/leadAcquisitionRoutes';
