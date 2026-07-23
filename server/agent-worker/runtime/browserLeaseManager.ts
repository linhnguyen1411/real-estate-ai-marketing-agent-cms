/**
 * Browser Lease Manager — ownership, heartbeat, TTL, reclaim, takeover (G1.5).
 * In-process state machine for Browser Pool handles. No business logic.
 */

import {
  BROWSER_LEASE_HEARTBEAT_MS,
  BROWSER_LEASE_TIMEOUT_MS,
  formatLeaseOwnerLine,
  isBrowserLeaseBusy,
  type BrowserLeaseAcquireInput,
  type BrowserLeaseAcquireResult,
  type BrowserLeaseInfo,
  type BrowserLeaseReclaimResult,
  type BrowserLeaseState,
} from './leaseTypes';
import type { BrowserPurpose } from './types';

export type LeaseRecord = {
  browserId: string;
  purpose: BrowserPurpose;
  profileName: string;
  state: BrowserLeaseState;
  leaseId: string | null;
  jobId: string | null;
  missionRunId: string | null;
  workerId: string | null;
  agentId: string | null;
  machineId: string | null;
  createdAt: number | null;
  lastHeartbeat: number | null;
  leaseTimeoutMs: number;
};

export type LeaseManagerOptions = {
  profileName: string;
  machineId?: string | null;
  agentId?: string | null;
  workerId?: string | null;
  leaseTimeoutMs?: number;
  purposes?: BrowserPurpose[];
  now?: () => number;
};

let leaseSeq = 0;
function nextLeaseId(purpose: BrowserPurpose): string {
  leaseSeq += 1;
  return `browser_${purpose}_${Date.now()}_${leaseSeq}`;
}

const DEFAULT_PURPOSES: BrowserPurpose[] = ['scan', 'publish', 'messaging', 'comment'];

export class BrowserLeaseManager {
  private readonly records = new Map<BrowserPurpose, LeaseRecord>();
  private readonly profileName: string;
  private readonly machineId: string | null;
  private readonly agentId: string | null;
  private readonly workerId: string | null;
  private readonly defaultTimeoutMs: number;
  private readonly now: () => number;
  private readonly purposes: BrowserPurpose[];

  constructor(opts: LeaseManagerOptions) {
    this.profileName = opts.profileName;
    this.machineId = opts.machineId ?? null;
    this.agentId = opts.agentId ?? null;
    this.workerId = opts.workerId ?? null;
    this.defaultTimeoutMs = opts.leaseTimeoutMs ?? BROWSER_LEASE_TIMEOUT_MS;
    this.now = opts.now ?? (() => Date.now());
    this.purposes = opts.purposes ?? DEFAULT_PURPOSES;

    for (const purpose of this.purposes) {
      this.records.set(purpose, this.emptyRecord(purpose));
    }
  }

  private emptyRecord(purpose: BrowserPurpose): LeaseRecord {
    return {
      browserId: `browser_${purpose}_1`,
      purpose,
      profileName: this.profileName,
      state: 'idle',
      leaseId: null,
      jobId: null,
      missionRunId: null,
      workerId: null,
      agentId: null,
      machineId: null,
      createdAt: null,
      lastHeartbeat: this.now(),
      leaseTimeoutMs: this.defaultTimeoutMs,
    };
  }

  getRecord(purpose: BrowserPurpose): LeaseRecord | undefined {
    return this.records.get(purpose);
  }

  listRecords(): LeaseRecord[] {
    return this.purposes.map(p => this.records.get(p)!);
  }

  toInfo(rec: LeaseRecord, at = this.now()): BrowserLeaseInfo {
    const busy = isBrowserLeaseBusy(rec.state);
    const runningSec =
      busy && rec.createdAt != null ? Math.max(0, Math.round((at - rec.createdAt) / 1000)) : null;
    let leaseRemainingSec: number | null = null;
    if (busy && rec.lastHeartbeat != null) {
      const expiresAt = rec.lastHeartbeat + rec.leaseTimeoutMs;
      leaseRemainingSec = Math.max(0, Math.round((expiresAt - at) / 1000));
    }
    return {
      browserId: rec.browserId,
      profileName: rec.profileName || this.profileName,
      machineId: rec.machineId ?? this.machineId,
      agentId: rec.agentId ?? this.agentId,
      workerId: rec.workerId ?? this.workerId,
      missionRunId: rec.missionRunId,
      jobId: rec.jobId,
      purpose: rec.purpose,
      leaseId: rec.leaseId,
      createdAt: rec.createdAt,
      lastHeartbeat: rec.lastHeartbeat,
      leaseTimeoutMs: rec.leaseTimeoutMs,
      state: rec.state,
      leaseRemainingSec,
      runningSec,
    };
  }

  snapshot(at = this.now()): BrowserLeaseInfo[] {
    return this.listRecords().map(r => this.toInfo(r, at));
  }

  /** Soft acquire — fails if busy by another job (unless takeover of expired/orphan). */
  acquire(input: BrowserLeaseAcquireInput): BrowserLeaseAcquireResult {
    const rec = this.records.get(input.purpose);
    if (!rec) {
      throw new BrowserLeaseBusyError(input.purpose, null);
    }

    const at = this.now();
    this.expireIfStale(rec, at);

    if (rec.state === 'recovering') {
      throw new BrowserLeaseBusyError(input.purpose, this.toInfo(rec, at));
    }

    const sameJob =
      isBrowserLeaseBusy(rec.state) && rec.jobId === input.jobId && Boolean(rec.leaseId);

    if (isBrowserLeaseBusy(rec.state) && !sameJob) {
      if (input.takeover && (rec.state === 'expired' || rec.state === 'orphan')) {
        this.clearOwner(rec, 'takeover');
      } else if (rec.state === 'expired' || rec.state === 'orphan') {
        this.clearOwner(rec, 'expired');
      } else {
        throw new BrowserLeaseBusyError(input.purpose, this.toInfo(rec, at));
      }
    }

    rec.state = 'leasing';
    const leaseId = sameJob && rec.leaseId ? rec.leaseId : nextLeaseId(input.purpose);
    rec.leaseId = leaseId;
    rec.jobId = input.jobId;
    rec.missionRunId = input.missionRunId ?? null;
    rec.workerId = input.workerId ?? this.workerId;
    rec.agentId = input.agentId ?? this.agentId;
    rec.machineId = input.machineId ?? this.machineId;
    if (input.profileName) rec.profileName = input.profileName;
    rec.leaseTimeoutMs = input.leaseTimeoutMs ?? this.defaultTimeoutMs;
    if (!sameJob || !rec.createdAt) rec.createdAt = at;
    rec.lastHeartbeat = at;
    rec.state = 'active';

    const info = this.toInfo(rec, at);
    return {
      leaseId,
      browserId: rec.browserId,
      purpose: input.purpose,
      jobId: input.jobId,
      missionRunId: rec.missionRunId,
      acquiredAt: rec.createdAt!,
      info,
    };
  }

  release(purpose: BrowserPurpose, leaseId?: string | null): BrowserLeaseReclaimResult | null {
    const rec = this.records.get(purpose);
    if (!rec || !rec.leaseId) return null;
    if (leaseId && rec.leaseId !== leaseId) return null;

    const previousJobId = rec.jobId;
    const prevLeaseId = rec.leaseId;
    rec.state = 'releasing';
    this.clearOwner(rec, 'release');
    return {
      purpose,
      leaseId: prevLeaseId,
      previousJobId,
      reason: 'release',
    };
  }

  forceRelease(purpose: BrowserPurpose): BrowserLeaseReclaimResult | null {
    const rec = this.records.get(purpose);
    if (!rec) return null;
    if (!rec.leaseId && rec.state === 'idle') return null;
    const previousJobId = rec.jobId;
    const prevLeaseId = rec.leaseId;
    rec.state = 'releasing';
    this.clearOwner(rec, 'force');
    return {
      purpose,
      leaseId: prevLeaseId,
      previousJobId,
      reason: 'force',
    };
  }

  takeover(purpose: BrowserPurpose, input: BrowserLeaseAcquireInput): BrowserLeaseAcquireResult {
    const rec = this.records.get(purpose);
    if (!rec) throw new BrowserLeaseBusyError(purpose, null);
    if (isBrowserLeaseBusy(rec.state) || rec.state === 'expired' || rec.state === 'orphan') {
      this.clearOwner(rec, 'takeover');
    }
    return this.acquire({ ...input, purpose, takeover: true });
  }

  markOrphan(purpose: BrowserPurpose): BrowserLeaseReclaimResult | null {
    const rec = this.records.get(purpose);
    if (!rec || !isBrowserLeaseBusy(rec.state)) return null;
    const previousJobId = rec.jobId;
    const prevLeaseId = rec.leaseId;
    rec.state = 'orphan';
    rec.lastHeartbeat = this.now();
    return {
      purpose,
      leaseId: prevLeaseId,
      previousJobId,
      reason: 'orphan',
    };
  }

  markExpired(purpose: BrowserPurpose): BrowserLeaseReclaimResult | null {
    const rec = this.records.get(purpose);
    if (!rec || !isBrowserLeaseBusy(rec.state)) return null;
    const previousJobId = rec.jobId;
    const prevLeaseId = rec.leaseId;
    rec.state = 'expired';
    rec.lastHeartbeat = this.now();
    return {
      purpose,
      leaseId: prevLeaseId,
      previousJobId,
      reason: 'expired',
    };
  }

  markRecovering(purpose: BrowserPurpose): void {
    const rec = this.records.get(purpose);
    if (!rec) return;
    if (rec.leaseId) {
      // keep owner briefly visible while recovering
    }
    rec.state = 'recovering';
    rec.lastHeartbeat = this.now();
  }

  markRecovered(purpose: BrowserPurpose): BrowserLeaseReclaimResult | null {
    const rec = this.records.get(purpose);
    if (!rec) return null;
    const previousJobId = rec.jobId;
    const prevLeaseId = rec.leaseId;
    this.clearOwner(rec, 'crash');
    rec.state = 'idle';
    return {
      purpose,
      leaseId: prevLeaseId,
      previousJobId,
      reason: 'crash',
    };
  }

  /** Heartbeat all active leases; expire stale ones. */
  tickHeartbeat(at = this.now()): {
    heartbeated: BrowserLeaseInfo[];
    expired: BrowserLeaseReclaimResult[];
  } {
    const heartbeated: BrowserLeaseInfo[] = [];
    const expired: BrowserLeaseReclaimResult[] = [];

    for (const rec of this.records.values()) {
      if (rec.state === 'active' || rec.state === 'leasing') {
        const expiredNow = this.expireIfStale(rec, at);
        if (expiredNow) {
          expired.push({
            purpose: rec.purpose,
            leaseId: rec.leaseId,
            previousJobId: rec.jobId,
            reason: 'expired',
          });
        } else {
          rec.lastHeartbeat = at;
          heartbeated.push(this.toInfo(rec, at));
        }
      } else if (rec.state === 'idle') {
        rec.lastHeartbeat = at;
      }
    }

    return { heartbeated, expired };
  }

  /** Reclaim all expired/orphan leases → idle. */
  reclaimStale(at = this.now()): BrowserLeaseReclaimResult[] {
    const out: BrowserLeaseReclaimResult[] = [];
    for (const rec of this.records.values()) {
      this.expireIfStale(rec, at);
      if (rec.state === 'expired' || rec.state === 'orphan') {
        const previousJobId = rec.jobId;
        const prevLeaseId = rec.leaseId;
        const reason = rec.state === 'orphan' ? 'orphan' : 'expired';
        this.clearOwner(rec, reason);
        out.push({
          purpose: rec.purpose,
          leaseId: prevLeaseId,
          previousJobId,
          reason,
        });
      }
    }
    return out;
  }

  releaseJob(jobId: string): BrowserLeaseReclaimResult[] {
    const out: BrowserLeaseReclaimResult[] = [];
    for (const purpose of this.purposes) {
      const rec = this.records.get(purpose);
      if (rec?.jobId === jobId) {
        const r = this.release(purpose, rec.leaseId);
        if (r) out.push(r);
      }
    }
    return out;
  }

  releaseMission(missionRunId: string): BrowserLeaseReclaimResult[] {
    const out: BrowserLeaseReclaimResult[] = [];
    for (const purpose of this.purposes) {
      const rec = this.records.get(purpose);
      if (rec?.missionRunId === missionRunId) {
        const r = this.release(purpose, rec.leaseId);
        if (r) out.push(r);
      }
    }
    return out;
  }

  releaseAll(): BrowserLeaseReclaimResult[] {
    const out: BrowserLeaseReclaimResult[] = [];
    for (const purpose of this.purposes) {
      const r = this.forceRelease(purpose);
      if (r) out.push(r);
    }
    return out;
  }

  assertNoLeaks(): { browserLeak: number } {
    let browserLeak = 0;
    for (const r of this.records.values()) {
      if (isBrowserLeaseBusy(r.state) || r.jobId || r.leaseId) browserLeak += 1;
    }
    return { browserLeak };
  }

  private expireIfStale(rec: LeaseRecord, at: number): boolean {
    if (!isBrowserLeaseBusy(rec.state)) return false;
    if (rec.lastHeartbeat == null) return false;
    if (at - rec.lastHeartbeat > rec.leaseTimeoutMs) {
      rec.state = 'expired';
      return true;
    }
    return false;
  }

  private clearOwner(
    rec: LeaseRecord,
    _reason: BrowserLeaseReclaimResult['reason'],
  ): void {
    rec.state = 'idle';
    rec.leaseId = null;
    rec.jobId = null;
    rec.missionRunId = null;
    rec.createdAt = null;
    rec.lastHeartbeat = this.now();
    // keep agent/machine identity defaults for next lease
    rec.workerId = this.workerId;
    rec.agentId = this.agentId;
    rec.machineId = this.machineId;
    rec.profileName = this.profileName;
    rec.leaseTimeoutMs = this.defaultTimeoutMs;
  }
}

export class BrowserLeaseBusyError extends Error {
  readonly code = 'BROWSER_BUSY';
  readonly purpose: BrowserPurpose;
  readonly owner: BrowserLeaseInfo | null;

  constructor(purpose: BrowserPurpose, owner: BrowserLeaseInfo | null) {
    const detail = owner ? ` held by ${formatLeaseOwnerLine(owner)}` : '';
    super(`BROWSER_BUSY: no free browser for purpose=${purpose}${detail}`);
    this.name = 'BrowserLeaseBusyError';
    this.purpose = purpose;
    this.owner = owner;
  }
}

export { BROWSER_LEASE_HEARTBEAT_MS, BROWSER_LEASE_TIMEOUT_MS };
