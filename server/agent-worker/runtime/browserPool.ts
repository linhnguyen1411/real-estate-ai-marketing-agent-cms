/**
 * Browser Pool — leases browser handles by purpose via Lease Manager (G1.5).
 * Wraps BrowserManager (connection + pages). No business logic.
 */

import type { BrowserManager } from '../browserManager';
import type { WorkerConfig } from '../config';
import {
  BrowserBusyError,
  type BrowserHandleSnapshot,
  type BrowserLease,
  type BrowserLeaseRequest,
  type BrowserPurpose,
} from './types';
import {
  BrowserLeaseBusyError,
  BrowserLeaseManager,
} from './browserLeaseManager';
import { isBrowserLeaseBusy } from './leaseTypes';
import {
  clearProfileLeaseSidecar,
  writeProfileLeaseSidecar,
} from './profileLeaseSidecar';

const PURPOSES: BrowserPurpose[] = ['scan', 'publish', 'messaging', 'comment'];

/**
 * One BrowserManager underneath; logical handles per purpose so scan/publish
 * can be leased independently (separate tabs, purpose-scoped CDP locks).
 */
export class BrowserPool {
  private readonly manager: BrowserManager;
  private readonly profile: string;
  private readonly leases: BrowserLeaseManager;

  constructor(manager: BrowserManager, config: WorkerConfig) {
    this.manager = manager;
    this.profile = config.activeProfileDir;
    this.leases = new BrowserLeaseManager({
      profileName: config.activeProfileDir,
      workerId: config.workerId,
      agentId: config.workerId,
      machineId: process.env.AGENT_MACHINE_ID?.trim() || null,
    });
  }

  /** Underlying manager for handlers that still expect BrowserManager. */
  getManager(): BrowserManager {
    return this.manager;
  }

  /** Direct access for OPS / recover / takeover. */
  getLeaseManager(): BrowserLeaseManager {
    return this.leases;
  }

  async lease(req: BrowserLeaseRequest): Promise<BrowserLease> {
    // Reclaim stale leases before acquire (TTL / orphan).
    const reclaimed = this.leases.reclaimStale();
    for (const r of reclaimed) {
      this.manager.releaseCdpLock(r.purpose);
    }
    this.syncCdpLocksWithLeases();

    let acquired;
    try {
      acquired = this.leases.acquire({
        purpose: req.purpose,
        jobId: req.jobId,
        missionRunId: req.missionRunId,
        workerId: req.workerId,
        agentId: req.agentId,
        machineId: req.machineId,
        takeover: req.takeover,
      });
    } catch (err) {
      if (err instanceof BrowserLeaseBusyError) {
        throw new BrowserBusyError(
          req.purpose,
          err.owner ? err.message.replace(/^BROWSER_BUSY:\s*/, '') : null,
          err.owner?.jobId ?? null,
        );
      }
      throw err;
    }

    try {
      await this.manager.beginCdpJob(req.purpose);
    } catch (err) {
      if (err instanceof Error && /CDP_BUSY/.test(err.message)) {
        this.syncCdpLocksWithLeases();
        try {
          await this.manager.beginCdpJob(req.purpose);
        } catch (retryErr) {
          this.leases.release(req.purpose, acquired.leaseId);
          throw retryErr;
        }
      } else {
        this.leases.release(req.purpose, acquired.leaseId);
        throw err;
      }
    }

    writeProfileLeaseSidecar(this.profile, acquired.info);

    let released = false;
    return {
      leaseId: acquired.leaseId,
      browserId: acquired.browserId,
      purpose: req.purpose,
      jobId: req.jobId,
      missionRunId: acquired.missionRunId,
      acquiredAt: acquired.acquiredAt,
      release: () => {
        if (released) return;
        released = true;
        this.releaseLease(req.purpose, acquired.leaseId);
      },
    };
  }

  releaseLease(purpose: BrowserPurpose, leaseId: string): void {
    const result = this.leases.release(purpose, leaseId);
    if (!result) return;
    this.manager.releaseCdpLock(purpose);
    this.syncSidecar();
  }

  releaseJob(jobId: string): number {
    const results = this.leases.releaseJob(jobId);
    for (const r of results) this.manager.releaseCdpLock(r.purpose);
    this.syncSidecar();
    return results.length;
  }

  releaseMission(missionRunId: string): number {
    const results = this.leases.releaseMission(missionRunId);
    for (const r of results) this.manager.releaseCdpLock(r.purpose);
    this.syncSidecar();
    return results.length;
  }

  /** Mark handle recovering after browser crash. */
  markCrashed(purpose: BrowserPurpose): void {
    this.leases.markRecovering(purpose);
    this.manager.releaseCdpLock(purpose);
    this.syncSidecar();
  }

  recoverCrashed(purpose: BrowserPurpose): void {
    this.leases.markRecovered(purpose);
    this.syncSidecar();
  }

  /** Force-release all purpose leases (OPS release_browser). */
  releaseAll(): number {
    const results = this.leases.releaseAll();
    this.manager.clearAllCdpLocks();
    clearProfileLeaseSidecar(this.profile);
    return results.length;
  }

  /** Force release one purpose (OPS force_release). */
  forceRelease(purpose: BrowserPurpose): boolean {
    const r = this.leases.forceRelease(purpose);
    if (!r) return false;
    this.manager.clearCdpLock(purpose);
    this.syncSidecar();
    return true;
  }

  /**
   * Takeover: reclaim any holder then acquire for the new job.
   * Used when prior lease expired/orphan or OPS takeover.
   */
  async takeover(req: BrowserLeaseRequest): Promise<BrowserLease> {
    const prev = this.leases.getRecord(req.purpose);
    if (prev?.leaseId) {
      this.manager.releaseCdpLock(req.purpose);
    }
    this.leases.forceRelease(req.purpose);
    return this.lease({ ...req, takeover: true });
  }

  /**
   * Heartbeat active leases + reclaim TTL expiry.
   * Call from agent heartbeat / worker loop (~10s).
   */
  tickHeartbeat(): {
    heartbeated: number;
    expired: Array<{ purpose: BrowserPurpose; jobId: string | null }>;
  } {
    const { heartbeated, expired } = this.leases.tickHeartbeat();
    for (const e of expired) {
      this.manager.releaseCdpLock(e.purpose);
    }
    const reclaimed = this.leases.reclaimStale();
    for (const r of reclaimed) {
      this.manager.releaseCdpLock(r.purpose);
    }
    this.syncCdpLocksWithLeases();
    if (heartbeated.length || expired.length || reclaimed.length) {
      this.syncSidecar();
    }
    return {
      heartbeated: heartbeated.length,
      expired: [...expired, ...reclaimed].map(e => ({
        purpose: e.purpose,
        jobId: e.previousJobId,
      })),
    };
  }

  snapshot(): BrowserHandleSnapshot[] {
    return this.leases.snapshot().map(info => {
      // Map G1.5 states; keep `leased` alias for older consumers of "busy".
      const state =
        info.state === 'active'
          ? ('leased' as const)
          : (info.state as BrowserHandleSnapshot['state']);
      return {
        browserId: info.browserId,
        purpose: info.purpose,
        profile: info.profileName || this.profile,
        state,
        ownerJob: info.jobId,
        ownerMission: info.missionRunId,
        machineId: info.machineId,
        agentId: info.agentId,
        workerId: info.workerId,
        leaseId: info.leaseId,
        leaseTimeoutMs: info.leaseTimeoutMs,
        leaseRemainingSec: info.leaseRemainingSec,
        heartbeatAt: info.lastHeartbeat,
        leasedAt: info.createdAt,
        leaseAgeSec: info.runningSec,
      };
    });
  }

  assertNoLeaks(): { browserLeak: number } {
    return this.leases.assertNoLeaks();
  }

  private syncSidecar(): void {
    const active = this.leases.snapshot().find(i => isBrowserLeaseBusy(i.state));
    if (active) {
      writeProfileLeaseSidecar(this.profile, active);
    } else {
      clearProfileLeaseSidecar(this.profile);
    }
  }

  /**
   * Orphan CDP locks can survive failed jobs / deploy when lease manager is idle.
   * Drop locks that have no active lease record for that purpose.
   */
  private syncCdpLocksWithLeases(): void {
    for (const purpose of PURPOSES) {
      const rec = this.leases.getRecord(purpose);
      const leaseBusy = rec != null && isBrowserLeaseBusy(rec.state);
      if (!leaseBusy && this.manager.getCdpLockOwner(purpose)) {
        this.manager.clearCdpLock(purpose);
      }
    }
  }
}
