/**
 * Fleet Registry types — Single Source of Truth for multi-machine awareness.
 * Built from Agent Registry + Runtime Snapshots (no direct Browser/Worker queries).
 */

import type { AgentCapability, AgentNodeStatus } from '../types';
import type {
  BrowserProfileTelemetry,
  ExecutionAgentRuntimeSnapshot,
  JobTelemetrySummary,
  MissionTelemetrySummary,
  PublishTelemetrySummary,
  ScannerTelemetrySummary,
} from '../telemetry/types';

/** Activity derived from last Runtime Snapshot (snapshot-based, not polled). */
export type FleetActivity =
  | 'idle'
  | 'busy'
  | 'scanning'
  | 'publishing'
  | 'campaign'
  | 'browser_hold'
  | 'error'
  | 'offline';

export type FleetAgent = {
  agentId: string;
  displayName: string;
  hostname: string;
  machineId: string;
  platform: string;
  version: string;
  tags: string[];
  capabilities: AgentCapability[];
  status: AgentNodeStatus;
  activity: FleetActivity;
  lastHeartbeat: string | null;
  heartbeatAgeMs: number | null;
  uptimeSec: number | null;
  companyId: string | null;
  sessionId: string;
  workerId: string | null;
  /** Resource snapshot (from Runtime Snapshot / metadata). */
  cpuLoad1m: number | null;
  memFreeMb: number | null;
  memTotalMb: number | null;
  rssMb: number | null;
  heapUsedMb: number | null;
  chromeCount: number;
  executionSlots: number;
  jobs: JobTelemetrySummary;
  mission: MissionTelemetrySummary | null;
  scanner: ScannerTelemetrySummary | null;
  publish: PublishTelemetrySummary | null;
  browserProfiles: BrowserProfileTelemetry[];
  currentUrl: string | null;
  lastError: string | null;
  /** Attached last Runtime Snapshot when available. */
  snapshot: ExecutionAgentRuntimeSnapshot | null;
};

export type FleetState = {
  generatedAt: string;
  total: number;
  online: number;
  offline: number;
  busy: number;
  idle: number;
  scanning: number;
  publishing: number;
  campaign: number;
  browserHold: number;
  error: number;
  runningJobs: number;
  runningMissions: number;
  runningBrowsers: number;
  healthScore: number;
  agents: FleetAgent[];
};

export type FleetBrowserRow = {
  agentId: string;
  hostname: string;
  machineId: string;
  profile: string;
  facebookAccount: string | null;
  busy: boolean;
  currentUrl: string | null;
  lockedBy: string | null;
  state: string;
};

export type FleetJobOwnership = {
  jobId: string;
  type: string;
  status: string;
  claimedBy: string | null;
  machineId: string | null;
  hostname: string | null;
  startedAt: string | null;
  durationMs: number | null;
  missionId: string | null;
};
