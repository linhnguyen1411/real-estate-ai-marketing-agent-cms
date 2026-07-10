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
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
  source?: { id: string; name: string; type: string };
  mission?: { id: string; name: string } | null;
  scannedContent?: {
    id: string;
    canonicalUrl: string;
    authorName?: string | null;
    collectedAt: string;
  };
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
  jobsCreated: number;
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
