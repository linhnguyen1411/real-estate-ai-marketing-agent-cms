/**
 * Planning Layer — AI Sales Employee (autonomous marketing agent).
 * Copilot + Planning only. Does not touch Runtime / Queue / Fleet / Browser / Scheduler / Publisher cores.
 */

export * from './types';
export { planCampaignBoard } from './campaignPlanner';
export { buildMarketIntelligenceReport } from './researchAgent';
export { proposeMissions } from './missionPlanner';
export { planContentSchedule } from './contentPlanner';
export { rankLeadCards } from './leadIntelligenceV2';
export { buildCampaignRecommendations } from './recommendationEngine';
export {
  rememberPlanningEvent,
  loadTodayTimeline,
  formatTimelineLines,
} from './operationalMemory';
export {
  createAndRunCampaign,
  findReusableActiveCampaign,
  getCampaign,
  listCampaigns,
  listCampaignsKanban,
  approveCampaign,
  rejectCampaign,
  completeCampaign,
  livingToBoard,
  campaignRuntimeSummaryLines,
  getCampaignOrchestratorTasks,
} from './campaignRuntime';
export {
  getCampaignWorkspace,
  listCampaignWorkspaceHealth,
  resolveCampaignWorkspace,
  formatCampaignWorkspaceLines,
  deriveCampaignHealth,
  workspaceTelegramMarkup,
} from './campaignWorkspace';
export type {
  CampaignWorkspace,
  CampaignWorkspaceHealth,
  CampaignHealthLevel,
} from './campaignWorkspace';
export {
  createCampaignTaskGraph,
  formatOrchestratorWorkLines,
  formatOrchestratorTaskCardLines,
  orchestratorProgress,
  listReadyTasks,
  taskDurationMs,
} from './taskOrchestrator';
export {
  runSalesEmployee,
  detectSalesMode,
  type SalesEmployeeReply,
} from './salesEmployee';
export { isCampaignPlanningUtterance, CAMPAIGN_ASSET_CUE_RE } from './campaignIntent';
export { matchAssetIdentity } from './asset/AssetMatcher';
export { validateAssetIdentity, AssetValidationError } from './asset/AssetValidator';
export type { AssetIdentity, AssetType } from './asset/AssetIdentity';
export {
  campaignCard,
  researchCard,
  leadCardsBlock,
  missionCardsBlock,
  contentPlanCard,
  recommendationCards,
  fleetEmployeeCard,
  timelineCard,
  workStatusCard,
} from './cards/telegramCards';
export { registerPlanningRoutes } from './api/planningRoutes';
