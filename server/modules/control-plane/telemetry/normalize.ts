/**
 * Normalize raw agent metadata → ExecutionAgentRuntimeSnapshot.
 * Pure — no DB / browser.
 */

import {
  TELEMETRY_SCHEMA_VERSION,
  type BrowserProfileTelemetry,
  type ExecutionAgentRuntimeSnapshot,
  type HostTelemetry,
  type JobTelemetrySummary,
  type MissionTelemetrySummary,
  type ProcessTelemetry,
  type PublishTelemetrySummary,
  type ScannerTelemetrySummary,
} from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function normalizeHostTelemetry(
  meta: Record<string, unknown>,
  hostnameFallback: string,
): HostTelemetry {
  const host = asRecord(meta.host || meta.hostTelemetry);
  return {
    platform: str(host.platform) || str(meta.platform) || 'unknown',
    arch: str(host.arch) || str(meta.arch) || 'unknown',
    hostname: str(host.hostname) || str(meta.hostname) || hostnameFallback,
    uptimeSec: num(host.uptimeSec) ?? num(asRecord(meta.process).uptimeSec) ?? 0,
    loadAvg1m: num(host.loadAvg1m),
    memTotalMb: num(host.memTotalMb),
    memFreeMb: num(host.memFreeMb),
    diskFreeMb: num(host.diskFreeMb),
    diskTotalMb: num(host.diskTotalMb),
  };
}

export function normalizeProcessTelemetry(meta: Record<string, unknown>): ProcessTelemetry {
  const processMeta = asRecord(meta.process);
  return {
    pid: num(processMeta.pid),
    rssMb: num(processMeta.rssMb),
    heapUsedMb: num(processMeta.heapUsedMb),
    heapTotalMb: num(processMeta.heapTotalMb),
    uptimeSec: num(processMeta.uptimeSec),
  };
}

export function normalizeBrowserProfiles(
  meta: Record<string, unknown>,
  currentUrl?: string | null,
): BrowserProfileTelemetry[] {
  const browsers = asArray(meta.browserPool);
  const resources = asRecord(meta.resources);
  const facebookAccount =
    str(resources.facebookAccount) || str(meta.facebookAccount) || null;

  return browsers.map((raw, i) => {
    const b = asRecord(raw);
    const state = str(b.state) || 'unknown';
    const leasedAt = str(b.leasedAt);
    const runningSec =
      leasedAt && Number.isFinite(Date.parse(leasedAt))
        ? Math.max(0, Math.round((Date.now() - Date.parse(leasedAt)) / 1000))
        : num(b.leaseAgeSec);
    return {
      browserId: str(b.browserId) || `browser-${i}`,
      profile: str(b.profile) || str(meta.profilePath) || 'default',
      state,
      facebookAccount,
      currentUrl: str(b.currentUrl) || currentUrl || null,
      currentAction: str(b.currentAction) || str(resources.currentAction) || null,
      currentMission: str(b.ownerMission) || str(b.currentMission) || null,
      busy: state === 'leased' || state === 'busy',
      lockedBy: str(b.ownerJob) || str(b.lockedBy) || null,
      runningSec,
    };
  });
}

export function normalizeJobs(meta: Record<string, unknown>): JobTelemetrySummary {
  const jobs = asRecord(meta.jobs || meta.jobTelemetry);
  const slots = asArray(meta.executionPool);
  let running = num(jobs.running) ?? 0;
  let waiting = num(jobs.waiting) ?? 0;
  const owners: string[] = [];
  if (!num(jobs.running) && !num(jobs.waiting)) {
    running = 0;
    waiting = 0;
    for (const raw of slots) {
      const s = asRecord(raw);
      running += num(s.runningJobs) ?? 0;
      waiting += num(s.queuedWaiters) ?? 0;
      for (const o of asArray(s.owners)) {
        if (typeof o === 'string') owners.push(o);
        else {
          const rec = asRecord(o);
          const id = str(rec.jobId) || str(rec.id);
          if (id) owners.push(id);
        }
      }
    }
  }
  return {
    running,
    waiting,
    completed: num(jobs.completed) ?? undefined,
    failed: num(jobs.failed) ?? undefined,
    retry: num(jobs.retry) ?? undefined,
    currentStep: str(jobs.currentStep),
    progress: num(jobs.progress),
    etaSec: num(jobs.etaSec),
    owners,
  };
}

export function normalizeMission(meta: Record<string, unknown>): MissionTelemetrySummary | null {
  const m = asRecord(meta.mission || meta.missionTelemetry);
  if (!Object.keys(m).length) return null;
  return {
    missionName: str(m.missionName) || str(m.name),
    missionType: str(m.missionType) || str(m.type),
    currentStep: str(m.currentStep),
    progress: num(m.progress),
    durationSec: num(m.durationSec),
    findingCount: num(m.findingCount),
  };
}

export function normalizePublish(meta: Record<string, unknown>): PublishTelemetrySummary | null {
  const p = asRecord(meta.publish || meta.publishTelemetry);
  if (!Object.keys(p).length) return null;
  return {
    draftId: str(p.draftId),
    destination: str(p.destination),
    phase: str(p.phase),
    evidence: typeof p.evidence === 'boolean' ? p.evidence : Boolean(p.evidence),
    publishedUrl: str(p.publishedUrl),
    retryCount: num(p.retryCount),
  };
}

export function normalizeScanner(meta: Record<string, unknown>): ScannerTelemetrySummary | null {
  const s = asRecord(meta.scanner || meta.scannerTelemetry || asRecord(meta.resources).scan);
  if (!Object.keys(s).length) {
    const resources = asRecord(meta.resources);
    if (resources.postsScanned != null || resources.currentSource) {
      return {
        currentSource: str(resources.currentSource),
        currentGroup: str(resources.currentGroup),
        postsScanned: num(resources.postsScanned),
        postsRemaining: num(resources.postsRemaining),
        findings: num(resources.findings),
        currentKeyword: str(resources.currentKeyword),
      };
    }
    return null;
  }
  return {
    currentSource: str(s.currentSource),
    currentGroup: str(s.currentGroup),
    postsScanned: num(s.postsScanned),
    postsRemaining: num(s.postsRemaining),
    findings: num(s.findings),
    currentKeyword: str(s.currentKeyword),
  };
}

export function normalizeRuntimeSnapshot(input: {
  agentId: string;
  metadata: Record<string, unknown>;
  currentUrl?: string | null;
  heartbeatAt?: string;
  status?: string;
}): ExecutionAgentRuntimeSnapshot {
  const meta = input.metadata;
  const host = normalizeHostTelemetry(meta, input.agentId);
  const processMeta = normalizeProcessTelemetry(meta);
  const browserProfiles = normalizeBrowserProfiles(meta, input.currentUrl);
  const jobs = normalizeJobs(meta);
  const chromeCount =
    num(asRecord(meta.resources).chromeCount) ??
    num(asRecord(meta.resources).contexts) ??
    browserProfiles.length;

  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    agentId: input.agentId,
    hostname: host.hostname,
    version: str(meta.version) || '0.0.0',
    platform: host.platform,
    status: input.status,
    heartbeatAt: input.heartbeatAt || new Date().toISOString(),
    uptimeSec: processMeta.uptimeSec ?? host.uptimeSec,
    host,
    process: processMeta,
    chromeCount,
    browserProfiles,
    executionSlots: asArray(meta.executionPool),
    jobs,
    mission: normalizeMission(meta),
    publish: normalizePublish(meta),
    scanner: normalizeScanner(meta),
    currentUrl: input.currentUrl ?? null,
    slotUtilization: num(asRecord(meta.metrics).slotUtilization),
    browserUtilization: num(asRecord(meta.metrics).browserUtilization),
  };
}
