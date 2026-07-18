/**
 * Browser Pool — leases browser handles by purpose.
 * Wraps BrowserManager (connection + pages). No business logic.
 */

import type { BrowserManager } from '../browserManager';
import type { WorkerConfig } from '../config';
import {
  BrowserBusyError,
  type BrowserHandleSnapshot,
  type BrowserHandleState,
  type BrowserLease,
  type BrowserLeaseRequest,
  type BrowserPurpose,
} from './types';

interface HandleRecord {
  browserId: string;
  purpose: BrowserPurpose;
  profile: string;
  state: BrowserHandleState;
  ownerJob: string | null;
  ownerMission: string | null;
  leaseId: string | null;
  heartbeatAt: number | null;
  leasedAt: number | null;
}

const PURPOSES: BrowserPurpose[] = ['scan', 'publish', 'messaging', 'comment'];

let leaseSeq = 0;
function nextLeaseId(purpose: BrowserPurpose): string {
  leaseSeq += 1;
  return `browser_${purpose}_${Date.now()}_${leaseSeq}`;
}

/**
 * One BrowserManager underneath; logical handles per purpose so scan/publish
 * can be leased independently (separate tabs, purpose-scoped CDP locks).
 */
export class BrowserPool {
  private readonly handles = new Map<BrowserPurpose, HandleRecord>();
  private readonly manager: BrowserManager;
  private readonly profile: string;

  constructor(manager: BrowserManager, config: WorkerConfig) {
    this.manager = manager;
    this.profile = config.profileDir;
    for (const purpose of PURPOSES) {
      this.handles.set(purpose, {
        browserId: `browser_${purpose}_1`,
        purpose,
        profile: config.profileDir,
        state: 'idle',
        ownerJob: null,
        ownerMission: null,
        leaseId: null,
        heartbeatAt: Date.now(),
        leasedAt: null,
      });
    }
  }

  /** Underlying manager for handlers that still expect BrowserManager. */
  getManager(): BrowserManager {
    return this.manager;
  }

  async lease(req: BrowserLeaseRequest): Promise<BrowserLease> {
    const handle = this.handles.get(req.purpose);
    if (!handle) throw new BrowserBusyError(req.purpose);

    if (handle.state === 'crashed' || handle.state === 'stopping') {
      throw new BrowserBusyError(req.purpose);
    }
    if (handle.state === 'leased' && handle.ownerJob !== req.jobId) {
      throw new BrowserBusyError(req.purpose);
    }

    // Acquire purpose-scoped CDP lock on the manager (scan ∥ publish).
    await this.manager.beginCdpJob(req.purpose);

    const leaseId = nextLeaseId(req.purpose);
    handle.state = 'leased';
    handle.ownerJob = req.jobId;
    handle.ownerMission = req.missionRunId ?? null;
    handle.leaseId = leaseId;
    handle.heartbeatAt = Date.now();
    handle.leasedAt = Date.now();

    let released = false;
    return {
      leaseId,
      browserId: handle.browserId,
      purpose: req.purpose,
      jobId: req.jobId,
      missionRunId: handle.ownerMission,
      acquiredAt: Date.now(),
      release: () => {
        if (released) return;
        released = true;
        this.releaseLease(req.purpose, leaseId);
      },
    };
  }

  releaseLease(purpose: BrowserPurpose, leaseId: string): void {
    const handle = this.handles.get(purpose);
    if (!handle) return;
    if (handle.leaseId && handle.leaseId !== leaseId) return;

    this.manager.releaseCdpLock(purpose);
    handle.state = 'idle';
    handle.ownerJob = null;
    handle.ownerMission = null;
    handle.leaseId = null;
    handle.leasedAt = null;
    handle.heartbeatAt = Date.now();
  }

  releaseJob(jobId: string): number {
    let n = 0;
    for (const purpose of PURPOSES) {
      const handle = this.handles.get(purpose);
      if (handle?.ownerJob === jobId && handle.leaseId) {
        this.releaseLease(purpose, handle.leaseId);
        n += 1;
      }
    }
    return n;
  }

  releaseMission(missionRunId: string): number {
    let n = 0;
    for (const purpose of PURPOSES) {
      const handle = this.handles.get(purpose);
      if (handle?.ownerMission === missionRunId && handle.leaseId) {
        this.releaseLease(purpose, handle.leaseId);
        n += 1;
      }
    }
    return n;
  }

  /** Mark handle crashed and release (browser crash recovery). */
  markCrashed(purpose: BrowserPurpose): void {
    const handle = this.handles.get(purpose);
    if (!handle) return;
    if (handle.leaseId) {
      this.manager.releaseCdpLock(purpose);
    }
    handle.state = 'crashed';
    handle.ownerJob = null;
    handle.ownerMission = null;
    handle.leaseId = null;
    handle.leasedAt = null;
    handle.heartbeatAt = Date.now();
  }

  recoverCrashed(purpose: BrowserPurpose): void {
    const handle = this.handles.get(purpose);
    if (!handle) return;
    if (handle.state === 'crashed') {
      handle.state = 'idle';
      handle.leasedAt = null;
      handle.heartbeatAt = Date.now();
    }
  }

  releaseAll(): number {
    let n = 0;
    for (const purpose of PURPOSES) {
      const handle = this.handles.get(purpose);
      if (handle?.leaseId) {
        this.releaseLease(purpose, handle.leaseId);
        n += 1;
      } else if (handle) {
        handle.state = 'idle';
        handle.ownerJob = null;
        handle.ownerMission = null;
      }
    }
    return n;
  }

  tickHeartbeat(): void {
    const now = Date.now();
    for (const h of this.handles.values()) {
      h.heartbeatAt = now;
    }
  }

  snapshot(): BrowserHandleSnapshot[] {
    const now = Date.now();
    return PURPOSES.map(purpose => {
      const h = this.handles.get(purpose)!;
      const leaseAgeSec =
        h.leasedAt && h.state === 'leased'
          ? Math.max(0, Math.round((now - h.leasedAt) / 1000))
          : null;
      return {
        browserId: h.browserId,
        purpose: h.purpose,
        profile: h.profile || this.profile,
        state: h.state,
        ownerJob: h.ownerJob,
        ownerMission: h.ownerMission,
        heartbeatAt: h.heartbeatAt,
        leasedAt: h.leasedAt,
        leaseAgeSec,
      };
    });
  }

  assertNoLeaks(): { browserLeak: number } {
    let browserLeak = 0;
    for (const h of this.handles.values()) {
      if (h.state === 'leased' || h.ownerJob || h.leaseId) browserLeak += 1;
    }
    return { browserLeak };
  }
}
