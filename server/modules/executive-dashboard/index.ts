/**
 * H0.5 — Executive AI Operations Dashboard
 * Compose-only. Does not touch Runtime / Fleet / Scanner / Publisher cores.
 */

export type {
  ExecutiveTask,
  ExecutiveAttention,
  ExecutiveCampaignCard,
  ExecutiveFunnel,
  ExecutiveSnapshot,
} from './types';
export type {
  ExecutiveKpiCard,
  ExecutiveKpiDashboard,
  ExecutiveKpiTrend,
  SnapshotMetric,
  HeroBlock,
  RecommendationAction,
  AttentionItem,
  QuickAction,
} from './kpiTypes';
export { buildExecutiveSnapshot, formatExecutiveDashboardLines } from './executiveService';
export { buildExecutiveKpiDashboard } from './kpiService';
export { registerExecutiveDashboardRoutes } from './api/executiveRoutes';
