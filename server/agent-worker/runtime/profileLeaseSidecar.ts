/**
 * Profile lease sidecar — diagnose BROWSER_PROFILE_LOCKED with ownership (G1.5).
 * Soft coordination file next to Chrome user-data-dir; not a hard OS lock.
 */

import fs from 'fs';
import path from 'path';
import type { BrowserLeaseInfo } from './leaseTypes';
import { formatLeaseOwnerLine } from './leaseTypes';

export type ProfileLeaseSidecar = {
  schemaVersion: 1;
  profilePath: string;
  browserId: string | null;
  purpose: string | null;
  leaseId: string | null;
  jobId: string | null;
  missionRunId: string | null;
  agentId: string | null;
  workerId: string | null;
  machineId: string | null;
  state: string;
  createdAt: string | null;
  lastHeartbeat: string | null;
  pid: number;
  updatedAt: string;
};

function sidecarPath(profileDir: string): string {
  const resolved = path.resolve(profileDir);
  return `${resolved}.cms-lease.json`;
}

export function writeProfileLeaseSidecar(
  profileDir: string,
  info: Partial<BrowserLeaseInfo> & { state: string },
): void {
  const payload: ProfileLeaseSidecar = {
    schemaVersion: 1,
    profilePath: path.resolve(profileDir),
    browserId: info.browserId ?? null,
    purpose: info.purpose ?? null,
    leaseId: info.leaseId ?? null,
    jobId: info.jobId ?? null,
    missionRunId: info.missionRunId ?? null,
    agentId: info.agentId ?? null,
    workerId: info.workerId ?? null,
    machineId: info.machineId ?? null,
    state: info.state,
    createdAt: info.createdAt ? new Date(info.createdAt).toISOString() : null,
    lastHeartbeat: info.lastHeartbeat
      ? new Date(info.lastHeartbeat).toISOString()
      : null,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(sidecarPath(profileDir), JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    /* best-effort */
  }
}

export function clearProfileLeaseSidecar(profileDir: string): void {
  try {
    const p = sidecarPath(profileDir);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* best-effort */
  }
}

export function readProfileLeaseSidecar(profileDir: string): ProfileLeaseSidecar | null {
  try {
    const p = sidecarPath(profileDir);
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as ProfileLeaseSidecar;
    if (!raw || raw.schemaVersion !== 1) return null;
    return raw;
  } catch {
    return null;
  }
}

export function formatProfileLockDiagnostic(profileDir: string): string {
  const side = readProfileLeaseSidecar(profileDir);
  if (!side) {
    return `profile=${path.resolve(profileDir)} (no CMS lease sidecar — another Chrome/process may hold the OS lock)`;
  }
  const ageMs = Date.now() - Date.parse(side.updatedAt);
  const age =
    Number.isFinite(ageMs) && ageMs >= 0
      ? ageMs < 60_000
        ? `${Math.round(ageMs / 1000)}s ago`
        : `${Math.round(ageMs / 60_000)}m ago`
      : 'unknown';
  const owner = formatLeaseOwnerLine({
    browserId: side.browserId || 'unknown',
    profileName: side.profilePath,
    machineId: side.machineId,
    agentId: side.agentId,
    workerId: side.workerId,
    missionRunId: side.missionRunId,
    jobId: side.jobId,
    purpose: (side.purpose as BrowserLeaseInfo['purpose']) || 'scan',
    leaseId: side.leaseId,
    createdAt: side.createdAt ? Date.parse(side.createdAt) : null,
    lastHeartbeat: side.lastHeartbeat ? Date.parse(side.lastHeartbeat) : null,
    leaseTimeoutMs: 45_000,
    state: (side.state as BrowserLeaseInfo['state']) || 'active',
    leaseRemainingSec: null,
    runningSec: null,
  });
  return `profile=${path.resolve(profileDir)} owner=${owner} pid=${side.pid} sidecar=${age}`;
}
