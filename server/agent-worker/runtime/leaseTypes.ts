/**
 * Browser Ownership & Lease Manager — types (G1.5).
 * Pure contracts; no scan/publish business logic.
 */

import type { BrowserPurpose } from './types';

/** Lease lifecycle states for a browser profile handle. */
export const BROWSER_LEASE_STATES = [
  'idle',
  'leasing',
  'active',
  'releasing',
  'expired',
  'orphan',
  'recovering',
] as const;

export type BrowserLeaseState = (typeof BROWSER_LEASE_STATES)[number];

/** Default lease heartbeat / TTL (ms). */
export const BROWSER_LEASE_HEARTBEAT_MS = 10_000;
export const BROWSER_LEASE_TIMEOUT_MS = 45_000;

export type BrowserLeaseOwner = {
  machineId: string | null;
  agentId: string | null;
  workerId: string | null;
  missionRunId: string | null;
  jobId: string | null;
  purpose: BrowserPurpose;
};

export type BrowserLeaseInfo = {
  browserId: string;
  profileName: string;
  machineId: string | null;
  agentId: string | null;
  workerId: string | null;
  missionRunId: string | null;
  jobId: string | null;
  purpose: BrowserPurpose;
  leaseId: string | null;
  createdAt: number | null;
  lastHeartbeat: number | null;
  leaseTimeoutMs: number;
  state: BrowserLeaseState;
  /** Seconds remaining until TTL expiry (null if idle). */
  leaseRemainingSec: number | null;
  /** Seconds since lease created (null if idle). */
  runningSec: number | null;
};

export type BrowserLeaseAcquireInput = {
  purpose: BrowserPurpose;
  jobId: string;
  missionRunId?: string | null;
  workerId?: string | null;
  agentId?: string | null;
  machineId?: string | null;
  profileName?: string;
  leaseTimeoutMs?: number;
  /** When true, steal an expired/orphan lease. */
  takeover?: boolean;
};

export type BrowserLeaseAcquireResult = {
  leaseId: string;
  browserId: string;
  purpose: BrowserPurpose;
  jobId: string;
  missionRunId: string | null;
  acquiredAt: number;
  info: BrowserLeaseInfo;
};

export type BrowserLeaseReclaimResult = {
  purpose: BrowserPurpose;
  leaseId: string | null;
  previousJobId: string | null;
  reason: 'expired' | 'orphan' | 'force' | 'takeover' | 'release' | 'crash';
};

export function isBrowserLeaseBusy(state: BrowserLeaseState | string): boolean {
  return state === 'active' || state === 'leasing' || state === 'releasing' || state === 'leased';
}

export function formatLeaseOwnerLine(info: BrowserLeaseInfo): string {
  const parts = [
    info.machineId || info.agentId || info.workerId || 'unknown-agent',
    info.purpose,
    info.jobId ? `job=${info.jobId}` : null,
    info.missionRunId ? `mission=${info.missionRunId}` : null,
    info.state,
  ].filter(Boolean);
  return parts.join(' · ');
}
