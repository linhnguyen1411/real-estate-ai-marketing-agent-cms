/**
 * Execution Pool / Browser Pool — runtime resource types only.
 * No Scan / Publish / Messaging business logic here.
 */

export const EXECUTION_SLOT_KINDS = ['scan', 'publish', 'messaging', 'comment'] as const;
export type ExecutionSlotKind = (typeof EXECUTION_SLOT_KINDS)[number];

export type SlotStatus = 'ready' | 'busy' | 'stopped' | 'draining';

export type BrowserPurpose = ExecutionSlotKind;

export type BrowserHandleState = 'idle' | 'leased' | 'stopping' | 'crashed';

export interface SlotAcquireRequest {
  jobId: string;
  missionRunId?: string | null;
  workerId?: string | null;
  /** 0 = fail immediately if full; >0 wait up to ms */
  waitTimeoutMs?: number;
}

export interface SlotLease {
  leaseId: string;
  kind: ExecutionSlotKind;
  jobId: string;
  missionRunId: string | null;
  acquiredAt: number;
  release: () => void;
}

export interface BrowserLeaseRequest {
  purpose: BrowserPurpose;
  jobId: string;
  missionRunId?: string | null;
  workerId?: string | null;
}

export interface BrowserLease {
  leaseId: string;
  browserId: string;
  purpose: BrowserPurpose;
  jobId: string;
  missionRunId: string | null;
  acquiredAt: number;
  release: () => void;
}

export interface BrowserHandleSnapshot {
  browserId: string;
  purpose: BrowserPurpose;
  profile: string;
  state: BrowserHandleState;
  ownerJob: string | null;
  ownerMission: string | null;
  heartbeatAt: number | null;
  /** Epoch ms when current lease started (null if idle). */
  leasedAt: number | null;
  /** Seconds since lease start. */
  leaseAgeSec: number | null;
}

export interface ExecutionSlotSnapshot {
  kind: ExecutionSlotKind;
  maxConcurrency: number;
  runningJobs: number;
  queuedWaiters: number;
  status: SlotStatus;
  heartbeatAt: number | null;
  owners: Array<{ jobId: string; leaseId: string; missionRunId: string | null }>;
  /** In-process counters since worker boot */
  completedSinceBoot: number;
  failedSinceBoot: number;
  totalRuntimeMsSinceBoot: number;
  avgRuntimeMsSinceBoot: number | null;
  busyPercent: number;
}

export class SlotBusyError extends Error {
  readonly code = 'SLOT_BUSY';
  constructor(kind: ExecutionSlotKind, detail?: string) {
    super(`SLOT_BUSY: ${kind}${detail ? ` — ${detail}` : ''}`);
    this.name = 'SlotBusyError';
  }
}

export class SlotStoppedError extends Error {
  readonly code = 'SLOT_STOPPED';
  constructor(kind: ExecutionSlotKind) {
    super(`SLOT_STOPPED: slot ${kind} is stopped`);
    this.name = 'SlotStoppedError';
  }
}

export class BrowserBusyError extends Error {
  readonly code = 'BROWSER_BUSY';
  constructor(purpose: BrowserPurpose) {
    super(`BROWSER_BUSY: no free browser for purpose=${purpose}`);
    this.name = 'BrowserBusyError';
  }
}
