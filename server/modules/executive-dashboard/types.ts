/**
 * Executive Command Center V2 snapshot contract.
 * Read/compose only; no Runtime/Fleet/Scanner core mutations.
 */

export type RuntimeState = 'online' | 'degraded' | 'offline';
export type ScanState =
  | 'running'
  | 'queued'
  | 'success'
  | 'failed'
  | 'paused'
  | 'offline'
  | 'stale'
  | 'overdue'
  | 'queued_too_long';
export type SourceRecommendation = 'PRIORITIZE' | 'KEEP' | 'REDUCE' | 'PAUSE' | 'DELETE';

export type FreshnessBlock = {
  generatedAt: string;
  stale: boolean;
  staleAfterSeconds: number;
  ageSeconds: number;
};

export type ComponentHealth = {
  status: RuntimeState;
  reason: string | null;
  updatedAt: string | null;
};

export type RuntimeHealth = {
  overallStatus: RuntimeState;
  scanner: ComponentHealth & {
    sources: number;
    runningSources: number;
  };
  browser: ComponentHealth & {
    sessionsOnline: number;
    sessionsOffline: number;
  };
  worker: ComponentHealth & {
    activeWorkers: number;
    lastHeartbeatAt: string | null;
  };
  queue: ComponentHealth & {
    queuedJobs: number;
    runningJobs: number;
    failedJobs: number;
  };
  scheduler: ComponentHealth & {
    tickIntervalMs: number | null;
    lastTickAt: string | null;
  };
};

export type SalesSnapshot = {
  buyersToday: number;
  qualifiedToday: number;
  urgentBuyers: number;
  pipelineValue: number;
  expectedRevenue: number;
  ignoredToday: number;
  spamLearnedToday: number;
  spamHitRate: number;
  rejectedBeforeAi: number;
  pendingLearning: number;
  decisionsLearnedToday: number;
  learningPromoted: number;
  falsePositivePrevented: number;
  links: {
    buyersToday: string;
    qualifiedToday: string;
    urgentBuyers: string;
    pipeline: string;
    expectedRevenue: string;
  };
};

export type SourcesSummary = {
  total: number;
  active: number;
  running: number;
  queued: number;
  failed: number;
  paused: number;
  offline: number;
};

export type SourcePerformanceRow = {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  sourceUrl: string | null;
  status: string;
  priority: number;
  qualityScore: number;
  recommendation: SourceRecommendation;
  recommendationReason: string;
  lastScanAt: string | null;
  nextScanAt: string | null;
  lastSuccessScanAt: string | null;
  currentJobStatus: string | null;
  currentJobId: string | null;
  postsScanned: number;
  findings: number;
  leads: number;
  buyers: number;
  qualified: number;
  investor: number;
  tenant: number;
  dismissed: number;
  duplicate: number;
  leadRate: number;
  buyerRate: number;
  qualifiedRate: number;
  duplicateRate: number;
  failureRate: number;
  freshnessHours: number | null;
  lastError: string | null;
  filters: {
    leads: string;
    buyers: string;
    qualified: string;
    urgent: string;
  };
  actions: {
    scanNow: boolean;
    pause: boolean;
    resume: boolean;
    edit: boolean;
    viewLeads: boolean;
    viewHistory: boolean;
  };
};

export type ScanScheduleRow = {
  sourceId: string;
  sourceName: string;
  status: ScanState;
  currentJobId: string | null;
  currentJobStatus: string | null;
  lastScanAt: string | null;
  nextScanAt: string | null;
  intervalMinutes: number;
  lastResult: string;
  jobsQueued: number;
  jobsRunning: number;
  jobsFailed24h: number;
  postsScanned24h: number;
  findings24h: number;
  leads24h: number;
  buyers24h: number;
  lastError: string | null;
  nextAction: string;
};

export type RecentBuyerRow = {
  findingId: string;
  title: string;
  persona: string | null;
  role: string | null;
  confidence: number;
  need: string | null;
  budget: string | null;
  location: string | null;
  propertyType: string | null;
  hasPhone: boolean;
  source: string | null;
  createdAt: string;
  journey: string | null;
  nextAction: string | null;
  openLink: string;
};

export type AttentionItem = {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  actionLabel: string | null;
  actionHref: string | null;
};

export type ExecutiveAction = {
  id: string;
  label: string;
  available: boolean;
  method: 'GET' | 'POST' | 'PATCH';
  href: string;
  reason: string | null;
};

export type IntegrityCheck = {
  name:
    | 'buyers_today'
    | 'qualified_today'
    | 'urgent_buyers'
    | 'pipeline_value'
    | 'expected_revenue'
    | 'source_leads'
    | 'source_buyers'
    | 'source_qualified'
    | 'source_investors'
    | 'source_status';
  expected: number;
  actual: number;
  status: 'OK' | 'MISMATCH';
};

export type IntegrityBlock = {
  status: 'OK' | 'MISMATCH';
  checks: IntegrityCheck[];
  mismatchCount: number;
  generatedAt: string;
};

export type ExecutiveSnapshot = {
  version: 'executive_command_center_v2';
  generatedAt: string;
  freshness: FreshnessBlock;
  ai: {
    status: RuntimeState;
    reason: string;
    lastActivityAt: string | null;
    summary: string;
  };
  runtime: RuntimeHealth;
  sales: SalesSnapshot;
  sources: SourcesSummary;
  sourcePerformance: SourcePerformanceRow[];
  scanSchedule: ScanScheduleRow[];
  recentBuyers: RecentBuyerRow[];
  attention: AttentionItem[];
  actions: {
    available: ExecutiveAction[];
    unavailable: ExecutiveAction[];
  };
  integrity: IntegrityBlock;
};
