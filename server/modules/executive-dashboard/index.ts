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
export { buildExecutiveSnapshot, formatExecutiveDashboardLines } from './executiveService';
export { registerExecutiveDashboardRoutes } from './api/executiveRoutes';
