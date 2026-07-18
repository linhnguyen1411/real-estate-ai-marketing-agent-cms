/**
 * Execution Pool — in-process slot concurrency for the worker process.
 *
 * Scheduler only enqueues AgentJobs. This pool decides which slot runs.
 * No Scan / Publish / Messaging business logic.
 */

import {
  EXECUTION_SLOT_KINDS,
  SlotBusyError,
  SlotStoppedError,
  type ExecutionSlotKind,
  type ExecutionSlotSnapshot,
  type SlotAcquireRequest,
  type SlotLease,
  type SlotStatus,
} from './types';

interface SlotConfig {
  maxConcurrency: number;
}

interface RunningEntry {
  leaseId: string;
  jobId: string;
  missionRunId: string | null;
  acquiredAt: number;
}

interface Waiter {
  resolve: (lease: SlotLease) => void;
  reject: (err: Error) => void;
  req: SlotAcquireRequest;
  timer: ReturnType<typeof setTimeout> | null;
}

interface SlotState {
  kind: ExecutionSlotKind;
  maxConcurrency: number;
  status: SlotStatus;
  running: Map<string, RunningEntry>;
  waiters: Waiter[];
  heartbeatAt: number | null;
}

function readMax(kind: ExecutionSlotKind, fallback: number): number {
  const envKey = `AGENT_SLOT_${kind.toUpperCase()}_MAX`;
  const raw = process.env[envKey];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function defaultConfigs(): Record<ExecutionSlotKind, SlotConfig> {
  return {
    // Scan + Publish can run together (each max 1 by default).
    scan: { maxConcurrency: readMax('scan', 1) },
    publish: { maxConcurrency: readMax('publish', 1) },
    messaging: { maxConcurrency: readMax('messaging', 0) },
    comment: { maxConcurrency: readMax('comment', 0) },
  };
}

let leaseSeq = 0;
function nextLeaseId(kind: ExecutionSlotKind): string {
  leaseSeq += 1;
  return `slot_${kind}_${Date.now()}_${leaseSeq}`;
}

export class ExecutionPool {
  private readonly slots = new Map<ExecutionSlotKind, SlotState>();

  constructor(configs: Partial<Record<ExecutionSlotKind, SlotConfig>> = {}) {
    const defaults = defaultConfigs();
    for (const kind of EXECUTION_SLOT_KINDS) {
      const cfg = configs[kind] ?? defaults[kind];
      this.slots.set(kind, {
        kind,
        maxConcurrency: cfg.maxConcurrency,
        status: cfg.maxConcurrency <= 0 ? 'stopped' : 'ready',
        running: new Map(),
        waiters: [],
        heartbeatAt: Date.now(),
      });
    }
  }

  hasFreeCapacity(kind?: ExecutionSlotKind): boolean {
    if (kind) {
      const s = this.require(kind);
      return s.status !== 'stopped' && s.running.size < s.maxConcurrency;
    }
    for (const s of this.slots.values()) {
      if (s.status !== 'stopped' && s.maxConcurrency > 0 && s.running.size < s.maxConcurrency) {
        return true;
      }
    }
    return false;
  }

  async acquire(kind: ExecutionSlotKind, req: SlotAcquireRequest): Promise<SlotLease> {
    const slot = this.require(kind);
    slot.heartbeatAt = Date.now();

    if (slot.status === 'stopped') {
      throw new SlotStoppedError(kind);
    }
    if (slot.maxConcurrency <= 0) {
      throw new SlotStoppedError(kind);
    }

    if (slot.running.size < slot.maxConcurrency) {
      return this.grant(slot, req);
    }

    const waitMs = req.waitTimeoutMs ?? 0;
    if (waitMs <= 0) {
      throw new SlotBusyError(kind, `running=${slot.running.size}/${slot.maxConcurrency}`);
    }

    return new Promise<SlotLease>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        req,
        timer: setTimeout(() => {
          const idx = slot.waiters.indexOf(waiter);
          if (idx >= 0) slot.waiters.splice(idx, 1);
          reject(new SlotBusyError(kind, `wait_timeout=${waitMs}ms`));
        }, waitMs),
      };
      slot.waiters.push(waiter);
    });
  }

  /** Soft-stop a slot: refuse new work; running jobs finish (or stopJob). Worker stays alive. */
  stopSlot(kind: ExecutionSlotKind): void {
    const slot = this.require(kind);
    slot.status = 'stopped';
    slot.heartbeatAt = Date.now();
    while (slot.waiters.length) {
      const w = slot.waiters.shift()!;
      if (w.timer) clearTimeout(w.timer);
      w.reject(new SlotStoppedError(kind));
    }
  }

  /** Resume a previously stopped slot. */
  startSlot(kind: ExecutionSlotKind): void {
    const slot = this.require(kind);
    if (slot.maxConcurrency <= 0) return;
    slot.status = slot.running.size >= slot.maxConcurrency ? 'busy' : 'ready';
    slot.heartbeatAt = Date.now();
    this.pump(slot);
  }

  /** Release resources for one job (cancel/stop job path). */
  stopJob(jobId: string): boolean {
    for (const slot of this.slots.values()) {
      for (const [leaseId, entry] of slot.running) {
        if (entry.jobId === jobId) {
          slot.running.delete(leaseId);
          this.afterRelease(slot);
          return true;
        }
      }
      // Drop waiters for this job
      slot.waiters = slot.waiters.filter(w => {
        if (w.req.jobId !== jobId) return true;
        if (w.timer) clearTimeout(w.timer);
        w.reject(new SlotBusyError(slot.kind, 'job_stopped'));
        return false;
      });
    }
    return false;
  }

  /** Release all leases tied to a mission run (mission cancel). */
  releaseMission(missionRunId: string): number {
    let n = 0;
    for (const slot of this.slots.values()) {
      for (const [leaseId, entry] of [...slot.running.entries()]) {
        if (entry.missionRunId === missionRunId) {
          slot.running.delete(leaseId);
          n += 1;
        }
      }
      this.afterRelease(slot);
    }
    return n;
  }

  releaseAll(): number {
    let n = 0;
    for (const slot of this.slots.values()) {
      n += slot.running.size;
      slot.running.clear();
      while (slot.waiters.length) {
        const w = slot.waiters.shift()!;
        if (w.timer) clearTimeout(w.timer);
        w.reject(new SlotBusyError(slot.kind, 'pool_reset'));
      }
      this.afterRelease(slot);
    }
    return n;
  }

  tickHeartbeat(): void {
    const now = Date.now();
    for (const slot of this.slots.values()) {
      slot.heartbeatAt = now;
    }
  }

  snapshot(): ExecutionSlotSnapshot[] {
    return EXECUTION_SLOT_KINDS.map(kind => {
      const s = this.require(kind);
      return {
        kind,
        maxConcurrency: s.maxConcurrency,
        runningJobs: s.running.size,
        queuedWaiters: s.waiters.length,
        status: s.status,
        heartbeatAt: s.heartbeatAt,
        owners: [...s.running.values()].map(e => ({
          jobId: e.jobId,
          leaseId: e.leaseId,
          missionRunId: e.missionRunId,
        })),
      };
    });
  }

  assertNoLeaks(): { slotLeak: number } {
    let slotLeak = 0;
    for (const s of this.slots.values()) {
      slotLeak += s.running.size;
      slotLeak += s.waiters.length;
    }
    return { slotLeak };
  }

  private grant(slot: SlotState, req: SlotAcquireRequest): SlotLease {
    const leaseId = nextLeaseId(slot.kind);
    const entry: RunningEntry = {
      leaseId,
      jobId: req.jobId,
      missionRunId: req.missionRunId ?? null,
      acquiredAt: Date.now(),
    };
    slot.running.set(leaseId, entry);
    slot.status = slot.running.size >= slot.maxConcurrency ? 'busy' : 'ready';
    slot.heartbeatAt = Date.now();

    let released = false;
    return {
      leaseId,
      kind: slot.kind,
      jobId: req.jobId,
      missionRunId: entry.missionRunId,
      acquiredAt: entry.acquiredAt,
      release: () => {
        if (released) return;
        released = true;
        if (slot.running.delete(leaseId)) {
          this.afterRelease(slot);
        }
      },
    };
  }

  private afterRelease(slot: SlotState): void {
    slot.heartbeatAt = Date.now();
    if (slot.status === 'stopped') {
      return;
    }
    slot.status = slot.running.size >= slot.maxConcurrency ? 'busy' : 'ready';
    this.pump(slot);
  }

  private pump(slot: SlotState): void {
    while (
      slot.status !== 'stopped' &&
      slot.running.size < slot.maxConcurrency &&
      slot.waiters.length > 0
    ) {
      const w = slot.waiters.shift()!;
      if (w.timer) clearTimeout(w.timer);
      try {
        w.resolve(this.grant(slot, w.req));
      } catch (err) {
        w.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private require(kind: ExecutionSlotKind): SlotState {
    const s = this.slots.get(kind);
    if (!s) throw new Error(`Unknown slot kind: ${kind}`);
    return s;
  }
}
