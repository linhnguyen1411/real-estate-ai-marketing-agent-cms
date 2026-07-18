export type AgentSourceType = 'facebook_group' | 'website' | 'forum' | 'search';
export type AgentSourceStatus = 'active' | 'paused' | 'error';
export type AgentMissionStatus = 'draft' | 'active' | 'paused' | 'completed';
export type AgentJobStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AgentFindingStatus = 'new' | 'reviewed' | 'promoted' | 'dismissed';

export interface AgentListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AgentDashboardCounts {
  activeSources: number;
  queuedJobs: number;
  runningJobs: number;
  newFindings: number;
  unreadNotifications: number;
  jobsFailed24h: number;
  sourcesWithError?: number;
  postsNewLastScans?: number;
  recentSourceScans?: AgentSourceScanSummary[];
}

export interface AgentSourceScanSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  lastScannedAt: string | null;
  nextScanAt: string | null;
  lastError: string | null;
  postsNew: number | null;
  findings?: number | null;
  stoppedReason: string | null;
}

export interface AgentSource {
  id: string;
  companyId: string | null;
  name: string;
  type: AgentSourceType | string;
  url: string;
  status: AgentSourceStatus | string;
  priority: number;
  scanIntervalMinutes: number;
  config: Record<string, unknown>;
  checkpoint?: Record<string, unknown> | null;
  lastScannedAt?: string | null;
  nextScanAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMission {
  id: string;
  companyId: string | null;
  ownerUserId: string | null;
  name: string;
  objective: string;
  status: AgentMissionStatus | string;
  rules: Record<string, unknown>;
  schedule?: Record<string, unknown> | null;
  pipeline?: Record<string, unknown> | null;
  pipelineVersion?: number;
  templateKey?: string | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  scheduler?: {
    lastRunStatus?: string | null;
    lastRunAt?: string | null;
    nextRunAt?: string | null;
    schedule?: Record<string, unknown> | null;
    runningCount?: number;
    sourceCount?: number;
    pipelineStepCount?: number;
    schedulerSkipReason?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AgentMissionRunDetail {
  id: string;
  missionId: string;
  missionName: string;
  status: string;
  triggerType: string;
  triggeredBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  pipelineVersion: number;
  pipelineHash: string | null;
  sources: Array<{ id: string; name: string; url: string }>;
  jobs: Array<{
    id: string;
    sourceId: string | null;
    status: string;
    type: string;
    errorMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
  metrics: Record<string, number>;
  stepSummary: {
    total: number;
    completed: number;
    skipped: number;
    failed: number;
    pending: number;
    running: number;
  };
  errors: Array<{
    stepId: string;
    stepType: string;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  steps: Array<{
    id: string;
    stepId: string;
    stepType: string;
    status: string;
    executionTarget: string | null;
    sourceId: string | null;
    scannedContentId: string | null;
    findingId: string | null;
    externalInventoryId: string | null;
    attempts: number;
    durationMs: number | null;
    startedAt: string | null;
    completedAt: string | null;
    warnings: string[];
    errorCode: string | null;
    errorMessage: string | null;
  }>;
}

export interface AgentMissionTemplate {
  id: string;
  name: string;
  objective: string;
  category?: string;
  workflowVersion?: number;
  pipeline?: {
    version: number;
    steps: Array<{
      id: string;
      type: string;
      enabled?: boolean;
      dependsOn?: string[];
      config?: Record<string, unknown>;
    }>;
  };
  rules: {
    sourceIds?: string[];
    positiveKeywords?: string[];
    negativeKeywords?: string[];
    minFindingScore?: number;
    minScore?: number;
    notifyScore?: number;
    maxItemsPerRun?: number;
    analysisInstructions?: string;
    preferredSourceTypes?: Array<'facebook_group' | 'website' | 'forum' | 'search' | string>;
    [key: string]: unknown;
  };
  schedule?: {
    cadence: string;
    preferredHoursLocal?: number[];
    timezone?: string;
  };
}

export interface AgentDailyReportMetrics {
  date: string;
  timezone: string;
  rangeStart: string;
  rangeEnd: string;
  sourcesScanned: number;
  postsNew: number;
  findingsTotal: number;
  findingsByScore: {
    hot: number;
    warm: number;
    cool: number;
    buckets: Array<{ label: string; min: number; max: number; count: number }>;
  };
  topLeads: Array<{
    id: string;
    title: string;
    score: number;
    summary: string;
    sourceName: string | null;
    missionName: string | null;
    createdAt: string;
  }>;
  mostEffectiveSources: Array<{
    sourceId: string;
    sourceName: string;
    sourceType: string;
    findingsCount: number;
    avgScore: number;
    postsNew: number;
  }>;
  demandThemes: Array<{ theme: string; count: number }>;
  failedJobs: Array<{
    id: string;
    type: string;
    sourceName: string | null;
    missionName: string | null;
    errorMessage: string | null;
    finishedAt: string | null;
  }>;
  browserSessionHealth: {
    total: number;
    byStatus: Record<string, number>;
    needsLogin: number;
    staleHeartbeat: number;
    healthy: number;
  };
}

export interface AgentDailyReport {
  metrics: AgentDailyReportMetrics;
  aiSummary: string | null;
  aiSummaryError: string | null;
  dataSource: 'database';
}

export interface AgentJob {
  id: string;
  companyId: string | null;
  missionId: string | null;
  sourceId: string | null;
  type: string;
  status: AgentJobStatus | string;
  priority: number;
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
  claimedBy?: string | null;
  claimedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  availableAt: string;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  source?: { id: string; name: string; type: string } | null;
  mission?: { id: string; name: string } | null;
}

export interface AgentFinding {
  id: string;
  companyId: string | null;
  missionId: string | null;
  sourceId: string;
  scannedContentId: string;
  type: string;
  score: number;
  title: string;
  summary: string;
  extractedData: Record<string, unknown>;
  reasons: unknown[];
  status: AgentFindingStatus | string;
  promotedLeadId?: string | null;
  classification?: string | null;
  intent?: string | null;
  actorRole?: string | null;
  priority?: string | null;
  confidence?: number | null;
  keywordScore?: number | null;
  aiScore?: number | null;
  leadFitScore?: number | null;
  finalScore?: number | null;
  primaryPhone?: string | null;
  primaryLocation?: string | null;
  /** BigInt may arrive as string from JSON serialization */
  budgetMin?: string | number | null;
  budgetMax?: string | number | null;
  askingPrice?: string | number | null;
  propertyType?: string | null;
  dismissedAt?: string | null;
  dismissedBy?: string | null;
  dismissReason?: string | null;
  dismissNote?: string | null;
  duplicateOfFindingId?: string | null;
  dedupeStatus?: string | null;
  similarityScore?: number | null;
  dedupeReason?: string | null;
  intelligenceVersion?: string | null;
  personName?: string | null;
  needSummary?: string | null;
  scoreStatus?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  promotedAt?: string | null;
  promotedBy?: string | null;
  externalInventoryItemId?: string | null;
  externalInventorySavedAt?: string | null;
  externalInventorySavedBy?: string | null;
  analysisStatus?: string;
  consistencyWarnings?: string[];
  /** @deprecated Prefer `intelligence` */
  resolved?: Record<string, unknown>;
  /** Canonical Lead Intelligence (same object as server resolver output) */
  intelligence?: Record<string, unknown>;
  /** List-card summary DTO */
  intelligenceSummary?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  source?: { id: string; name: string; type: string };
  mission?: { id: string; name: string } | null;
  scannedContent?: {
    id: string;
    canonicalUrl: string;
    authorName?: string | null;
    authorUrl?: string | null;
    contentText?: string | null;
    publishedAt?: string | null;
    collectedAt: string;
  };
}

export interface ExternalInventoryItem {
  id: string;
  companyId: string | null;
  findingId?: string | null;
  title: string;
  description?: string | null;
  originalContent: string;
  propertyType?: string | null;
  transactionType: string;
  askingPriceMin?: string | number | null;
  askingPriceMax?: string | number | null;
  rentPrice?: string | number | null;
  city?: string | null;
  district?: string | null;
  ward?: string | null;
  street?: string | null;
  project?: string | null;
  areaMinM2?: number | null;
  areaMaxM2?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactFacebookUrl?: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  sourceType?: string | null;
  verificationStatus: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScannedContentItem {
  id: string;
  companyId: string | null;
  sourceId: string;
  externalId: string | null;
  canonicalUrl: string;
  authorName: string | null;
  authorUrl: string | null;
  contentText: string;
  contentHash: string;
  publishedAt: string | null;
  collectedAt: string;
  status: string;
  metrics?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  source?: { id: string; name: string; type: string };
  findings?: Array<{ id: string; score: number; status: string; type: string }>;
}

export interface AgentNotification {
  id: string;
  companyId: string | null;
  userId: string | null;
  findingId: string | null;
  type: string;
  eventKey?: string | null;
  title: string;
  message: string;
  severity: string;
  status: string;
  data?: Record<string, unknown> | null;
  createdAt: string;
  readAt?: string | null;
  finding?: { id: string; title: string; score: number; status: string } | null;
}

export interface EnqueueSourceResult {
  sourceId: string;
  jobId: string;
}

export interface EnqueueMissionResult {
  missionId: string;
  missionRunId?: string;
  jobsCreated: number;
  jobsSkipped?: number;
  jobIds: string[];
}

export interface BrowserSession {
  id: string;
  companyId: string | null;
  name: string;
  status: string;
  workerId: string | null;
  profilePath: string;
  currentUrl?: string | null;
  lastHeartbeatAt?: string | null;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type AgentActionType = 'comment' | 'message' | 'save' | 'follow_up';
export type AgentActionProposalStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed';
export type AgentActionRiskLevel = 'low' | 'medium' | 'high';

export interface AgentActionProposal {
  id: string;
  companyId: string | null;
  findingId: string;
  actionType: AgentActionType | string;
  draftText: string;
  rationale: string;
  riskLevel: AgentActionRiskLevel | string;
  status: AgentActionProposalStatus | string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  executedAt?: string | null;
  result?: Record<string, unknown> | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  finding?: {
    id: string;
    title: string;
    score: number;
    status: string;
    summary?: string;
    source?: { id: string; name: string; type: string } | null;
  } | null;
  audits?: AgentActionAuditLog[];
}

export interface AgentActionAuditLog {
  id: string;
  companyId: string | null;
  proposalId: string;
  actorUserId: string | null;
  action: string;
  detail?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AgentActionCopyResult {
  proposalId: string;
  draftText: string;
  status: string;
  actionType: string;
}

export interface AgentSpamRule {
  id: string;
  companyId?: string | null;
  sourceId?: string | null;
  type: string;
  action: string;
  rawValue: string;
  normalizedValue?: string | null;
  e164Value?: string | null;
  pattern?: string | null;
  label?: string | null;
  reason?: string | null;
  priority: number;
  isActive: boolean;
  expiresAt?: string | null;
  createdBy?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/agent/runtime - Automation Observability snapshot */
export interface AutomationRuntimeSnapshot {
  generatedAt: string;
  healthScore: number;
  health: {
    worker: number;
    browser: number;
    queue: number;
    mission: number;
    scheduler: number;
  };
  workers: Array<{
    id: string;
    workerId: string | null;
    name: string;
    status: string;
    lastHeartbeatAt: string | null;
    currentUrl: string | null;
    lastError: string | null;
    online: boolean;
    heartbeatAgeMs: number | null;
    runtime: {
      mode: unknown;
      executionPool: unknown;
      browserPool: unknown;
      resources: unknown;
      process: unknown;
      publishedAt: unknown;
    };
  }>;
  slots: unknown[];
  browsers: unknown[];
  process: unknown;
  queue: {
    waiting: number;
    claimed: number;
    running: number;
    retry: number;
    deadLetter: number;
    cancelled: number;
    completed: number;
  };
  activeJobs: Array<{
    id: string;
    type: string;
    status: string;
    priority: number;
    claimedBy: string | null;
    missionRunId: string | null;
    startedAt: string | null;
    claimedAt: string | null;
    availableAt: string | null;
    createdAt: string;
    errorMessage: string | null;
  }>;
  missions: {
    waiting: number;
    running: number;
    retry: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  missionTimeline: Array<{
    id: string;
    missionId: string;
    status: string;
    triggerType: string;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    error: string | null;
  }>;
  campaigns: Array<{
    id: string;
    campaignId: string;
    status: string;
    progress: {
      total: number;
      completed: number;
      failed: number;
      publishing: number;
      pending: number;
      skipped: number;
    };
    success: number;
    failed: number;
    partialSuccess: boolean;
    etaSec: number | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  metrics: {
    publishPerHour: number;
    scanPerHour: number;
    successRate: number | null;
    retryRate: number | null;
    browserUtilization: number | null;
    slotUtilization: number | null;
    completedLastHour: number;
    failedLastHour: number;
  };
}
