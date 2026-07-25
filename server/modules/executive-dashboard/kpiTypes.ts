/**
 * H0.5.2 — Executive Command Center payload for /admin/dashboard.
 * Compose-only. Does not touch Runtime cores.
 */

export type ExecutiveKpiTrend = 'up' | 'down' | 'flat' | null;

export type ExecutiveKpiCard = {
  id: string;
  title: string;
  bigNumber: string;
  trend: string | null;
  trendDirection: ExecutiveKpiTrend;
  miniStatus: string[];
  href: string;
};

export type SnapshotMetric = {
  id: string;
  title: string;
  value: string;
  valueNumeric: number | null;
  trendVsYesterday: string | null;
  trendVs7d: string | null;
  trendDirection: ExecutiveKpiTrend;
  href: string;
  hasData: boolean;
};

export type HeroBlock = {
  aiStatus: 'Working' | 'Attention' | 'Degraded' | 'Offline';
  aiStatusLabel: string;
  businessHealth: number | null;
  todayGoal: { label: string; current: number; target: number } | null;
  expectedRevenueTy: number | null;
  currentCampaign: string | null;
  confidence: number | null;
};

export type RecommendationAction = {
  id: string;
  action: string;
  detail: string;
  href: string;
};

export type AttentionItem = {
  severity: 'critical' | 'warning' | 'info';
  text: string;
  href: string;
};

export type QuickAction = {
  label: string;
  href: string;
};

export type ExecutiveKpiDashboard = {
  version: 'h052_executive_command';
  generatedAt: string;
  summary: string;
  hero: HeroBlock;
  snapshot: SnapshotMetric[];
  insights: string[];
  recommendations: RecommendationAction[];
  attention: AttentionItem[];
  quickActions: QuickAction[];
  /** Legacy 8-card strip kept for compatibility */
  kpis: ExecutiveKpiCard[];
};
