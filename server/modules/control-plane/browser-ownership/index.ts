/**
 * Control Plane Browser Ownership Registry (G1.5).
 * Tracks lease ownership from Runtime Snapshots; detects orphan leases when agents go offline.
 * No scanner/publisher business logic.
 */

import { emitRuntimeEventAsync } from '../runtimeEventBus';
import {
  enqueueRemoteCommand,
  getLastAgentSnapshot,
  listAgentSnapshots,
} from '../telemetry/collector';
import type { BrowserProfileTelemetry } from '../telemetry/types';

export type BrowserOwnershipRow = {
  agentId: string;
  hostname: string;
  machineId: string;
  browserId: string;
  profile: string;
  purpose: string | null;
  state: string;
  busy: boolean;
  jobId: string | null;
  missionRunId: string | null;
  workerId: string | null;
  leaseId: string | null;
  leaseRemainingSec: number | null;
  runningSec: number | null;
  lastHeartbeat: string | null;
  currentUrl: string | null;
  currentAction: string | null;
  facebookAccount: string | null;
  orphan: boolean;
};

type OwnershipAudit = {
  at: string;
  agentId: string;
  action: 'orphan' | 'recover' | 'release' | 'takeover' | 'expired';
  browserId?: string | null;
  profile?: string | null;
  jobId?: string | null;
  detail?: string;
};

const auditLog: OwnershipAudit[] = [];
const MAX_AUDIT = 200;

function pushAudit(entry: OwnershipAudit): void {
  auditLog.unshift(entry);
  if (auditLog.length > MAX_AUDIT) auditLog.length = MAX_AUDIT;
}

function profileToRow(
  agentId: string,
  hostname: string,
  machineId: string,
  p: BrowserProfileTelemetry,
  orphan = false,
): BrowserOwnershipRow {
  return {
    agentId,
    hostname,
    machineId: p.machineId || machineId,
    browserId: p.browserId,
    profile: p.profile,
    purpose: p.purpose || null,
    state: orphan && p.busy ? 'orphan' : p.state,
    busy: p.busy,
    jobId: p.jobId || p.lockedBy || null,
    missionRunId: p.missionRunId || p.currentMission || null,
    workerId: p.workerId || null,
    leaseId: p.leaseId || null,
    leaseRemainingSec: p.leaseRemainingSec ?? null,
    runningSec: p.runningSec ?? null,
    lastHeartbeat: p.lastHeartbeat || null,
    currentUrl: p.currentUrl || null,
    currentAction: p.currentAction || null,
    facebookAccount: p.facebookAccount || null,
    orphan,
  };
}

/** List ownership from warm telemetry snapshots. */
export function listBrowserOwnership(opts?: {
  agentId?: string | null;
  busyOnly?: boolean;
}): BrowserOwnershipRow[] {
  const snaps = listAgentSnapshots();
  const rows: BrowserOwnershipRow[] = [];
  for (const s of snaps) {
    if (opts?.agentId && s.agentId !== opts.agentId) continue;
    for (const p of s.browserProfiles) {
      if (opts?.busyOnly && !p.busy) continue;
      rows.push(
        profileToRow(s.agentId, s.hostname, s.hostname, p, false),
      );
    }
  }
  return rows;
}

export function getBrowserOwnershipAudit(limit = 50): OwnershipAudit[] {
  return auditLog.slice(0, Math.max(1, Math.min(limit, MAX_AUDIT)));
}

/**
 * When an agent goes offline while holding leases → mark orphan + auto recover request.
 */
export function handleAgentOfflineBrowserOwnership(input: {
  agentId: string;
  companyId?: string | null;
  autoRecover?: boolean;
}): {
  orphaned: BrowserOwnershipRow[];
  recoverRequested: boolean;
} {
  const snap = getLastAgentSnapshot(input.agentId);
  const orphaned: BrowserOwnershipRow[] = [];
  if (snap) {
    for (const p of snap.browserProfiles) {
      if (!p.busy) continue;
      const row = profileToRow(snap.agentId, snap.hostname, snap.hostname, p, true);
      orphaned.push(row);
      pushAudit({
        at: new Date().toISOString(),
        agentId: input.agentId,
        action: 'orphan',
        browserId: p.browserId,
        profile: p.profile,
        jobId: p.jobId || p.lockedBy || null,
        detail: 'agent_offline',
      });
      emitRuntimeEventAsync({
        type: 'BROWSER_EXPIRED',
        companyId: input.companyId ?? null,
        agentId: input.agentId,
        entityType: 'browser',
        entityId: p.browserId,
        payload: {
          reason: 'agent_offline',
          state: 'orphan',
          profile: p.profile,
          jobId: p.jobId || p.lockedBy || null,
          missionRunId: p.missionRunId || p.currentMission || null,
          leaseId: p.leaseId || null,
        },
      });
    }
  }

  let recoverRequested = false;
  if (orphaned.length > 0 && input.autoRecover !== false) {
    // Soft recover — delivered when agent returns online (or ignored if dead).
    enqueueRemoteCommand({
      agentId: input.agentId,
      action: 'restart_browser',
      payload: { reason: 'orphan_recover', orphaned: orphaned.length },
    });
    recoverRequested = true;
    pushAudit({
      at: new Date().toISOString(),
      agentId: input.agentId,
      action: 'recover',
      detail: `auto orphan recover (${orphaned.length})`,
    });
    emitRuntimeEventAsync({
      type: 'BROWSER_RECOVERED',
      companyId: input.companyId ?? null,
      agentId: input.agentId,
      entityType: 'agent',
      entityId: input.agentId,
      payload: {
        reason: 'orphan_auto_recover',
        orphaned: orphaned.length,
        requestedAt: new Date().toISOString(),
      },
    });
  }

  return { orphaned, recoverRequested };
}

export function formatBrowserOwnershipLines(rows: BrowserOwnershipRow[]): string[] {
  const lines = [`Browser ownership / profiles (${rows.length})`];
  if (rows.length === 0) {
    lines.push('(none — waiting for agent heartbeat snapshots)');
    return lines;
  }
  for (const r of rows.slice(0, 12)) {
    const locked =
      r.runningSec != null
        ? r.runningSec < 60
          ? `${r.runningSec}s`
          : `${Math.floor(r.runningSec / 60)}m${r.runningSec % 60}s`
        : '—';
    const hb = r.lastHeartbeat
      ? `${Math.max(0, Math.round((Date.now() - Date.parse(r.lastHeartbeat)) / 1000))}s`
      : '—';
    const ttl =
      r.leaseRemainingSec != null ? `${r.leaseRemainingSec}s` : '—';
    lines.push(`── ${r.profile.split(/[/\\]/).pop() || r.profile}`);
    lines.push(`Owner · ${r.hostname} (${r.agentId})`);
    if (r.missionRunId) lines.push(`Mission · ${r.missionRunId}`);
    if (r.jobId) lines.push(`Job · ${r.jobId}`);
    lines.push(
      `State · ${r.state}${r.orphan ? ' (orphan)' : ''} · Locked ${locked} · HB ${hb} · TTL ${ttl}`,
    );
    if (r.purpose) lines.push(`Purpose · ${r.purpose}`);
  }
  return lines;
}

/** Reset in-memory audit (tests). */
export function resetBrowserOwnershipForTests(): void {
  auditLog.length = 0;
}
