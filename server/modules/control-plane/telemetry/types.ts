/**
 * Execution Agent Telemetry types — shared Runtime Snapshot contract.
 * Channel-agnostic (Telegram / Web / Fleet / Discord).
 */

export const TELEMETRY_SCHEMA_VERSION = 1;

export type HostTelemetry = {
  platform: string;
  arch: string;
  hostname: string;
  uptimeSec: number;
  loadAvg1m: number | null;
  memTotalMb: number | null;
  memFreeMb: number | null;
  diskFreeMb: number | null;
  diskTotalMb: number | null;
};

export type ProcessTelemetry = {
  pid: number | null;
  rssMb: number | null;
  heapUsedMb: number | null;
  heapTotalMb: number | null;
  uptimeSec: number | null;
};

export type BrowserProfileTelemetry = {
  browserId: string;
  profile: string;
  state: string;
  facebookAccount?: string | null;
  currentUrl?: string | null;
  currentAction?: string | null;
  currentMission?: string | null;
  busy: boolean;
  lockedBy?: string | null;
  runningSec?: number | null;
};

export type JobTelemetrySummary = {
  running: number;
  waiting: number;
  completed?: number;
  failed?: number;
  retry?: number;
  currentStep?: string | null;
  progress?: number | null;
  etaSec?: number | null;
  owners: string[];
};

export type MissionTelemetrySummary = {
  missionName?: string | null;
  missionType?: string | null;
  currentStep?: string | null;
  progress?: number | null;
  durationSec?: number | null;
  findingCount?: number | null;
};

export type PublishTelemetrySummary = {
  draftId?: string | null;
  destination?: string | null;
  phase?: string | null;
  evidence?: boolean;
  publishedUrl?: string | null;
  retryCount?: number | null;
};

export type ScannerTelemetrySummary = {
  currentSource?: string | null;
  currentGroup?: string | null;
  postsScanned?: number | null;
  postsRemaining?: number | null;
  findings?: number | null;
  currentKeyword?: string | null;
};

export type ExecutionAgentRuntimeSnapshot = {
  schemaVersion: number;
  agentId: string;
  hostname: string;
  version: string;
  platform: string;
  status?: string;
  heartbeatAt: string;
  uptimeSec: number | null;
  host: HostTelemetry;
  process: ProcessTelemetry;
  chromeCount: number;
  browserProfiles: BrowserProfileTelemetry[];
  executionSlots: unknown[];
  jobs: JobTelemetrySummary;
  mission?: MissionTelemetrySummary | null;
  publish?: PublishTelemetrySummary | null;
  scanner?: ScannerTelemetrySummary | null;
  currentUrl?: string | null;
  slotUtilization?: number | null;
  browserUtilization?: number | null;
};

/** Soft remote commands delivered via heartbeat response (no SSH). */
export type TelemetryRemoteCommand = {
  id: string;
  action: string;
  requestedAt: string;
  payload?: Record<string, unknown>;
};
