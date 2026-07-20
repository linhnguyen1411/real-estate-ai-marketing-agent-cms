/**
 * Operations Center types — Metrics Snapshot + Work Metrics + Fleet Workload.
 * Dashboard / Telegram / Reports read these only (snapshot-based SSOT).
 */

import type { FleetActivity, FleetAgent, FleetState } from '../fleet/types';

export type MetricsRefreshReason =
  | 'interval_5m'
  | 'manual'
  | 'dashboard'
  | 'report'
  | 'telegram'
  | 'job_complete'
  | 'mission_complete'
  | 'publish_complete'
  | 'heartbeat'
  | 'startup';

export type MachineWorkRow = {
  agentId: string;
  hostname: string;
  machineId: string;
  displayName: string;
  status: string;
  activity: FleetActivity;
  assigned: number;
  running: number;
  completed: number;
  waiting: number;
  cpuLoad1m: number | null;
  memFreeMb: number | null;
  memTotalMb: number | null;
  rssMb: number | null;
  heapUsedMb: number | null;
  chromeCount: number;
  browserBusy: number;
  browserIdle: number;
  executionSlots: number;
  missionName: string | null;
  currentStep: string | null;
  heartbeatAgeMs: number | null;
};

export type FleetMetricsBlock = {
  machinesOnline: number;
  machinesOffline: number;
  machinesBusy: number;
  machinesIdle: number;
  cpuAvg: number | null;
  ramUsedPctAvg: number | null;
  browserBusy: number;
  browserIdle: number;
  healthScore: number;
};

export type ScannerMetricsBlock = {
  sources: number;
  assigned: number;
  running: number;
  completed: number;
  findingsToday: number;
  postsScanned: number;
};

export type PublisherMetricsBlock = {
  draft: number;
  queue: number;
  publishing: number;
  publishedToday: number;
  retry: number;
};

export type MissionMetricsBlock = {
  running: number;
  waiting: number;
  completed: number;
  failed: number;
};

export type FleetWorkloadBlock = {
  totalScanSources: number;
  assignedSources: number;
  completedSources: number;
  runningMissions: number;
  runningPublishJobs: number;
  runningCampaigns: number;
  waitingJobs: number;
  retryJobs: number;
  failedJobs: number;
};

/** Single Source of Truth for Operations Center dashboards. */
export type OperationsMetricsSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  refreshReason: MetricsRefreshReason;
  companyId: string | null;
  fleet: FleetMetricsBlock;
  scanner: ScannerMetricsBlock;
  publisher: PublisherMetricsBlock;
  mission: MissionMetricsBlock;
  workload: FleetWorkloadBlock;
  machines: MachineWorkRow[];
  /** Attached raw fleet aggregate for adapters that need it. */
  fleetState: FleetState | null;
  agents: FleetAgent[];
};

export const METRICS_INTERVAL_MS_DEFAULT = 5 * 60 * 1000;
