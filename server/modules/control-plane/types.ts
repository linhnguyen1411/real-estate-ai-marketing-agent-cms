/**
 * Control Plane types — Agent Registry, Runtime Events, Reports.
 * No business publish/scan logic.
 */

export const RUNTIME_EVENT_TYPES = [
  'MISSION_STARTED',
  'MISSION_COMPLETED',
  'MISSION_FAILED',
  'JOB_CREATED',
  'JOB_CLAIMED',
  'JOB_COMPLETED',
  'JOB_FAILED',
  'AGENT_ONLINE',
  'AGENT_OFFLINE',
  'SLOT_BUSY',
  'SLOT_RELEASED',
  'BROWSER_LEASED',
  'BROWSER_RELEASED',
  'CAMPAIGN_STARTED',
  'CAMPAIGN_COMPLETED',
  /** Ops Center soft commands (restart / browser release) — Event Bus only */
  'OPS_REQUEST',
] as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

export type AgentCapability =
  | 'scan'
  | 'publish'
  | 'messaging'
  | 'comment'
  | 'browser'
  | 'cdp';

export type AgentNodeStatus = 'online' | 'offline' | 'degraded' | 'needs_login' | 'starting';

export interface AgentNode {
  agentId: string;
  hostname: string;
  version: string;
  capabilities: AgentCapability[];
  status: AgentNodeStatus;
  heartbeatAt: string | null;
  heartbeatAgeMs: number | null;
  companyId: string | null;
  sessionId: string;
  workerId: string | null;
  executionSlots: unknown[];
  browserPool: unknown[];
  metrics: {
    pid: number | null;
    rssMb: number | null;
    heapUsedMb: number | null;
    uptimeSec: number | null;
    slotUtilization: number | null;
    browserUtilization: number | null;
  };
  currentUrl: string | null;
  lastError: string | null;
}

export interface RuntimeEventRecord {
  id: string;
  type: RuntimeEventType | string;
  agentId: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type ControlPlaneReportKind =
  | 'daily'
  | 'weekly'
  | 'campaign'
  | 'publish'
  | 'scanner'
  | 'runtime_health'
  | 'agent'
  | 'browser';
