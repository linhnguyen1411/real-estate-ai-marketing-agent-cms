/**
 * H0.5.1 — Executive KPI cards for main CMS Dashboard (/admin/dashboard).
 * Compose-only from existing business modules / DB. Does not touch Runtime cores.
 */

export type ExecutiveKpiTrend = 'up' | 'down' | 'flat' | null;

export type ExecutiveKpiCard = {
  id:
    | 'ai_status'
    | 'todays_buyers'
    | 'sales_pipeline'
    | 'active_campaigns'
    | 'content_engine'
    | 'publishing'
    | 'lead_acquisition'
    | 'attention';
  title: string;
  bigNumber: string;
  trend: string | null;
  trendDirection: ExecutiveKpiTrend;
  miniStatus: string[];
  href: string;
};

export type ExecutiveKpiDashboard = {
  version: 'h051_executive_kpis';
  generatedAt: string;
  kpis: ExecutiveKpiCard[];
};
