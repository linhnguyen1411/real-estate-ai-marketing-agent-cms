/**
 * Metrics Collector — builds OperationsMetricsSnapshot from Fleet + DB projections.
 * Does not poll agents or query Browser Runtime directly.
 */

import { prisma } from '../../../prisma';
import { getFleetState } from '../fleet';
import type { FleetAgent } from '../fleet/types';
import type {
  FleetMetricsBlock,
  FleetWorkloadBlock,
  MachineWorkRow,
  MetricsRefreshReason,
  MissionMetricsBlock,
  OperationsMetricsSnapshot,
  PublisherMetricsBlock,
  ScannerMetricsBlock,
} from './types';
import { METRICS_INTERVAL_MS_DEFAULT } from './types';

const lastByCompany = new Map<string, OperationsMetricsSnapshot>();
const KEY_GLOBAL = '__global__';

let timer: ReturnType<typeof setInterval> | null = null;
let lastHeartbeatRefreshAt = 0;
const HEARTBEAT_REFRESH_THROTTLE_MS = 60_000;

function companyKey(companyId?: string | null): string {
  return companyId || KEY_GLOBAL;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toMachineRow(a: FleetAgent): MachineWorkRow {
  const browserBusy = a.browserProfiles.filter(p => p.busy).length;
  const browserIdle = Math.max(0, a.browserProfiles.length - browserBusy);
  return {
    agentId: a.agentId,
    hostname: a.hostname,
    machineId: a.machineId,
    displayName: a.displayName,
    status: a.status,
    activity: a.activity,
    assigned: a.jobs.running + a.jobs.waiting,
    running: a.jobs.running,
    completed: 0,
    waiting: a.jobs.waiting,
    cpuLoad1m: a.cpuLoad1m,
    memFreeMb: a.memFreeMb,
    memTotalMb: a.memTotalMb,
    rssMb: a.rssMb,
    heapUsedMb: a.heapUsedMb,
    chromeCount: a.chromeCount,
    browserBusy,
    browserIdle,
    executionSlots: a.executionSlots,
    missionName: a.mission?.missionName ?? null,
    currentStep: a.jobs.currentStep || a.mission?.currentStep || null,
    heartbeatAgeMs: a.heartbeatAgeMs,
  };
}

function buildFleetBlock(agents: FleetAgent[], healthScore: number): FleetMetricsBlock {
  const online = agents.filter(a => a.status === 'online' || a.status === 'degraded');
  const busy = agents.filter(a =>
    ['busy', 'scanning', 'publishing', 'campaign', 'browser_hold'].includes(a.activity),
  );
  const idle = agents.filter(a => a.activity === 'idle');
  const cpuVals = online.map(a => a.cpuLoad1m).filter((n): n is number => n != null);
  const ramPcts = online
    .map(a => {
      if (a.memTotalMb == null || a.memTotalMb <= 0 || a.memFreeMb == null) return null;
      return ((a.memTotalMb - a.memFreeMb) / a.memTotalMb) * 100;
    })
    .filter((n): n is number => n != null);
  let browserBusy = 0;
  let browserIdle = 0;
  for (const a of agents) {
    for (const p of a.browserProfiles) {
      if (p.busy) browserBusy += 1;
      else browserIdle += 1;
    }
  }
  return {
    machinesOnline: online.length,
    machinesOffline: agents.filter(a => a.activity === 'offline' || a.status === 'offline').length,
    machinesBusy: busy.length,
    machinesIdle: idle.length,
    cpuAvg: avg(cpuVals),
    ramUsedPctAvg: avg(ramPcts),
    browserBusy,
    browserIdle,
    healthScore,
  };
}

async function loadDbBlocks(companyId?: string | null): Promise<{
  scanner: ScannerMetricsBlock;
  publisher: PublisherMetricsBlock;
  mission: MissionMetricsBlock;
  workload: FleetWorkloadBlock;
  completedByClaimed: Map<string, number>;
}> {
  const companyFilter = companyId ? { companyId } : {};
  const today = startOfToday();

  const [
    sourcesTotal,
    sourcesActive,
    scanRunning,
    scanCompletedToday,
    findingsToday,
    postsToday,
    draftCount,
    publishQueued,
    publishRunning,
    publishDoneToday,
    publishRetry,
    missionRunning,
    missionWaiting,
    missionCompleted,
    missionFailed,
    campaignsRunning,
    waitingJobs,
    retryJobs,
    failedJobs,
    completedJobsToday,
  ] = await Promise.all([
    prisma.agentSource.count({ where: { ...companyFilter } }),
    prisma.agentSource.count({ where: { ...companyFilter, status: 'active' } }),
    prisma.agentJob.count({
      where: {
        ...companyFilter,
        status: { in: ['running', 'claimed'] },
        type: { in: ['scan_source', 'source_scan'] },
      },
    }),
    prisma.agentJob.count({
      where: {
        ...companyFilter,
        status: 'completed',
        type: { in: ['scan_source', 'source_scan'] },
        finishedAt: { gte: today },
      },
    }),
    prisma.agentFinding.count({
      where: { ...companyFilter, createdAt: { gte: today } },
    }),
    prisma.scannedContent.count({
      where: { ...companyFilter, createdAt: { gte: today } },
    }),
    prisma.socialPostDraft.count({
      where: { ...companyFilter, status: { in: ['draft', 'ready', 'approved'] } },
    }).catch(() => 0),
    prisma.socialPublishJob.count({
      where: { ...companyFilter, status: { in: ['queued', 'scheduled'] } },
    }),
    prisma.socialPublishJob.count({
      where: { ...companyFilter, status: { in: ['running', 'publishing', 'claimed'] } },
    }),
    prisma.socialPublishJob.count({
      where: {
        ...companyFilter,
        status: { in: ['published', 'completed', 'success'] },
        completedAt: { gte: today },
      },
    }),
    prisma.socialPublishJob.count({
      where: { ...companyFilter, status: { in: ['retry', 'failed'] }, attempts: { gt: 0 } },
    }),
    prisma.agentMissionRun.count({
      where: { ...companyFilter, status: { in: ['running', 'claimed'] } },
    }),
    prisma.agentMissionRun.count({
      where: { ...companyFilter, status: { in: ['queued', 'waiting', 'pending'] } },
    }),
    prisma.agentMissionRun.count({
      where: { ...companyFilter, status: 'completed', completedAt: { gte: today } },
    }),
    prisma.agentMissionRun.count({
      where: { ...companyFilter, status: 'failed', completedAt: { gte: today } },
    }),
    prisma.agentJob.count({
      where: {
        ...companyFilter,
        status: { in: ['running', 'claimed'] },
        type: { in: ['campaign_run', 'publish_campaign'] },
      },
    }).catch(() => 0),
    prisma.agentJob.count({
      where: { ...companyFilter, status: { in: ['queued'] } },
    }),
    prisma.agentJob.count({
      where: {
        ...companyFilter,
        status: { in: ['queued', 'claimed'] },
        attempts: { gt: 0 },
      },
    }),
    prisma.agentJob.count({
      where: { ...companyFilter, status: 'failed' },
    }),
    prisma.agentJob.findMany({
      where: {
        ...companyFilter,
        status: 'completed',
        finishedAt: { gte: today },
        claimedBy: { not: null },
      },
      select: { claimedBy: true },
      take: 2000,
    }),
  ]);

  const completedByClaimed = new Map<string, number>();
  for (const row of completedJobsToday) {
    const key = String(row.claimedBy);
    completedByClaimed.set(key, (completedByClaimed.get(key) || 0) + 1);
  }

  // Assigned ≈ distinct sources with open scan jobs.
  const assignedRaw = await prisma.agentJob.findMany({
    where: {
      ...companyFilter,
      status: { in: ['queued', 'claimed', 'running'] },
      type: { in: ['scan_source', 'source_scan'] },
      sourceId: { not: null },
    },
    select: { sourceId: true },
    take: 5000,
  });
  const assignedSources =
    new Set(assignedRaw.map(r => r.sourceId).filter(Boolean)).size ||
    Math.min(sourcesActive, scanRunning + waitingJobs);

  const scanner: ScannerMetricsBlock = {
    sources: sourcesTotal,
    assigned: assignedSources,
    running: scanRunning,
    completed: scanCompletedToday,
    findingsToday,
    postsScanned: postsToday,
  };

  const publisher: PublisherMetricsBlock = {
    draft: draftCount,
    queue: publishQueued,
    publishing: publishRunning,
    publishedToday: publishDoneToday,
    retry: publishRetry,
  };

  const mission: MissionMetricsBlock = {
    running: missionRunning,
    waiting: missionWaiting,
    completed: missionCompleted,
    failed: missionFailed,
  };

  const workload: FleetWorkloadBlock = {
    totalScanSources: sourcesTotal,
    assignedSources,
    completedSources: scanCompletedToday,
    runningMissions: missionRunning,
    runningPublishJobs: publishRunning,
    runningCampaigns: campaignsRunning,
    waitingJobs,
    retryJobs,
    failedJobs,
  };

  return { scanner, publisher, mission, workload, completedByClaimed };
}

/** Collect a fresh Operations Metrics Snapshot (read-only projections). */
export async function collectOperationsMetrics(input?: {
  companyId?: string | null;
  reason?: MetricsRefreshReason;
}): Promise<OperationsMetricsSnapshot> {
  const companyId = input?.companyId ?? null;
  const reason = input?.reason ?? 'manual';
  const fleet = await getFleetState({ companyId });
  const db = await loadDbBlocks(companyId);

  const machines = fleet.agents.map(a => {
    const row = toMachineRow(a);
    const completed =
      db.completedByClaimed.get(a.agentId) ||
      db.completedByClaimed.get(a.workerId || '') ||
      0;
    return { ...row, completed };
  });

  const snapshot: OperationsMetricsSnapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    refreshReason: reason,
    companyId,
    fleet: buildFleetBlock(fleet.agents, fleet.healthScore),
    scanner: db.scanner,
    publisher: db.publisher,
    mission: db.mission,
    workload: db.workload,
    machines,
    // Lean for JSON API — avoid nesting full agent snapshots twice.
    fleetState: null,
    agents: [],
  };

  lastByCompany.set(companyKey(companyId), snapshot);
  return snapshot;
}

export function getLastOperationsMetrics(
  companyId?: string | null,
): OperationsMetricsSnapshot | null {
  return lastByCompany.get(companyKey(companyId)) || null;
}

export async function refreshOperationsMetrics(input?: {
  companyId?: string | null;
  reason?: MetricsRefreshReason;
}): Promise<OperationsMetricsSnapshot> {
  return collectOperationsMetrics(input);
}

/** Event-driven refresh with light throttling for heartbeats. */
export async function notifyMetricsEvent(input: {
  reason: MetricsRefreshReason;
  companyId?: string | null;
}): Promise<OperationsMetricsSnapshot | null> {
  if (input.reason === 'heartbeat') {
    const now = Date.now();
    if (now - lastHeartbeatRefreshAt < HEARTBEAT_REFRESH_THROTTLE_MS) {
      return getLastOperationsMetrics(input.companyId);
    }
    lastHeartbeatRefreshAt = now;
  }
  try {
    return await collectOperationsMetrics({
      companyId: input.companyId,
      reason: input.reason,
    });
  } catch {
    return getLastOperationsMetrics(input.companyId);
  }
}

export function resetOperationsMetricsForTests(): void {
  lastByCompany.clear();
  lastHeartbeatRefreshAt = 0;
  stopMetricsCollector();
}

export function startMetricsCollector(options?: {
  intervalMs?: number;
  companyId?: string | null;
}): { stop: () => void } {
  const intervalMs = options?.intervalMs ?? METRICS_INTERVAL_MS_DEFAULT;
  stopMetricsCollector();
  void collectOperationsMetrics({
    companyId: options?.companyId,
    reason: 'startup',
  }).catch(() => undefined);

  timer = setInterval(() => {
    void collectOperationsMetrics({
      companyId: options?.companyId,
      reason: 'interval_5m',
    }).catch(err => {
      console.warn('[metrics-collector] refresh failed', err instanceof Error ? err.message : err);
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return { stop: stopMetricsCollector };
}

export function stopMetricsCollector(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
