/**
 * H4 — Omnichannel Marketing Organization
 * Brain of the marketing funnel. Publisher remains the executor only.
 * Does not touch Runtime / Fleet / Browser / Scheduler / Campaign Runtime /
 * Task Orchestrator / Lead Acquisition / Sales Layer.
 */

export * from './types';
export { produceContentPack, channelLabel } from './contentFactory';
export { buildWeeklyContentCalendar } from './contentCalendar';
export { planContentReuse } from './contentReuse';
export { classifyConversation, buildConversationItem } from './socialCare';
export { detectTrendsFromTexts } from './trendDetection';
export { buildSeoGaps } from './seoOrganization';
export { computeMarketingHealth, updateMarketingLearning } from './campaignHealth';
export {
  buildMarketingSnapshot,
  createFactoryPack,
  createReusePlan,
  formatMarketingBriefing,
} from './marketingService';
export { registerMarketingOrgRoutes } from './api/marketingOrgRoutes';
