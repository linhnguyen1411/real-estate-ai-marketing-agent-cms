/**
 * Execution Agent — build telemetry block for heartbeat metadata.
 * Thin collector on the agent; no Mission/Scanner/Publisher business logic.
 */

import os from 'os';
import fs from 'fs';
import { TELEMETRY_SCHEMA_VERSION } from '../modules/control-plane/telemetry/types';

export type AgentTelemetryBuildInput = {
  agentId: string;
  version?: string;
  hostname?: string;
  browserPool: unknown[];
  executionPool: unknown[];
  resources?: Record<string, unknown>;
  process: {
    pid: number;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    uptimeSec: number;
  };
  currentUrl?: string | null;
  facebookAccount?: string | null;
  mission?: Record<string, unknown> | null;
  publish?: Record<string, unknown> | null;
  scanner?: Record<string, unknown> | null;
  jobs?: Record<string, unknown> | null;
};

function hostBlock(hostname: string, uptimeSec: number) {
  const load = os.loadavg?.() || [0, 0, 0];
  const total = os.totalmem();
  const free = os.freemem();
  let diskFreeMb: number | null = null;
  let diskTotalMb: number | null = null;
  try {
    // Node 18.15+ — best-effort; ignore if unavailable
    const statfs = (fs as unknown as { statfsSync?: (p: string) => { bavail: number; blocks: number; bsize: number } })
      .statfsSync;
    if (typeof statfs === 'function') {
      const root = process.platform === 'win32' ? process.cwd().slice(0, 3) : '/';
      const st = statfs(root);
      diskFreeMb = Math.round((st.bavail * st.bsize) / 1024 / 1024);
      diskTotalMb = Math.round((st.blocks * st.bsize) / 1024 / 1024);
    }
  } catch {
    /* optional */
  }
  return {
    platform: `${os.platform()}/${os.arch()}`,
    arch: os.arch(),
    hostname,
    uptimeSec,
    loadAvg1m: Array.isArray(load) ? Math.round((load[0] || 0) * 100) / 100 : null,
    memTotalMb: Math.round(total / 1024 / 1024),
    memFreeMb: Math.round(free / 1024 / 1024),
    diskFreeMb,
    diskTotalMb,
  };
}

function jobSummary(executionPool: unknown[], jobs?: Record<string, unknown> | null) {
  if (jobs) return jobs;
  let running = 0;
  let waiting = 0;
  const owners: string[] = [];
  for (const raw of executionPool) {
    const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    running += Number(s.runningJobs) || 0;
    waiting += Number(s.queuedWaiters) || 0;
    if (Array.isArray(s.owners)) {
      for (const o of s.owners) {
        if (typeof o === 'string') owners.push(o);
        else if (o && typeof o === 'object') {
          const id = (o as { jobId?: string; id?: string }).jobId || (o as { id?: string }).id;
          if (id) owners.push(String(id));
        }
      }
    }
  }
  return { running, waiting, owners };
}

/**
 * Attach `telemetry` + host/platform fields onto heartbeat metadata (single builder).
 */
export function buildExecutionTelemetryMetadata(
  input: AgentTelemetryBuildInput,
): Record<string, unknown> {
  const hostname = input.hostname || os.hostname();
  const host = hostBlock(hostname, input.process.uptimeSec);
  const resources = input.resources || {};
  const chromeCount =
    Number(resources.chromeCount) ||
    Number(resources.contexts) ||
    (Array.isArray(input.browserPool) ? input.browserPool.length : 0);

  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    platform: host.platform,
    arch: host.arch,
    hostname,
    version: input.version,
    host,
    process: input.process,
    jobs: jobSummary(input.executionPool, input.jobs),
    mission: input.mission || null,
    publish: input.publish || null,
    scanner: input.scanner || {
      currentSource: resources.currentSource ?? null,
      currentGroup: resources.currentGroup ?? null,
      postsScanned: resources.postsScanned ?? resources.scannedPosts ?? null,
      postsRemaining: resources.postsRemaining ?? null,
      findings: resources.findings ?? null,
      currentKeyword: resources.currentKeyword ?? null,
    },
    facebookAccount: input.facebookAccount || resources.facebookAccount || null,
    resources: {
      ...resources,
      chromeCount,
    },
    telemetry: {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      collectedAt: new Date().toISOString(),
      agentId: input.agentId,
    },
  };
}
