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
