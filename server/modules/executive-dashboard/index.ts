/**
 * H0.5 — Executive AI Operations Dashboard
 * Compose-only. Does not touch Runtime / Fleet / Scanner / Publisher cores.
 */

export type {
  FreshnessBlock,
  RuntimeHealth,
  SalesSnapshot,
  SourcesSummary,
  SourcePerformanceRow,
  ScanScheduleRow,
  AttentionItem as ExecutiveAttentionItem,
  ExecutiveAction,
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
export {
  buildExecutiveSnapshot,
  formatExecutiveDashboardLines,
  listExecutiveDrilldown,
} from './executiveService';
export { buildExecutiveKpiDashboard } from './kpiService';
export { evaluateSourceQuality } from './sourceQualityService';
export { buildIntegrityBlock, scanSnapshotFakeMarkers, sourceAggregate } from './executiveIntegrityService';
export { registerExecutiveDashboardRoutes } from './api/executiveRoutes';
