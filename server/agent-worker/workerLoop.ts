import type { AgentJob } from '@prisma/client';
import type { BrowserManager } from './browserManager';
import {
  claimNextJob,
  completeJob,
  requeueRunningJob,
  releaseJobToQueue,
} from './jobClaimer';
import { isShuttingDown } from './gracefulShutdown';
import type { WorkerConfig } from './config';
import { runScanSourceJob } from './scanSourceHandler';
import { runPublishSocialJob } from '../modules/social-publishing/worker/publishSocialHandler';
import { runtimeJobAls } from './runtime/als';
import type { BrowserPool } from './runtime/browserPool';
import type { ExecutionPool } from './runtime/executionPool';
import { slotKindForJobType } from './runtime/jobSlotMap';
import {
  BrowserBusyError,
  SlotBusyError,
  SlotStoppedError,
  type BrowserLease,
  type SlotLease,
} from './runtime/types';

type JobHandler = (
  job: AgentJob,
  browser: BrowserManager,
) => Promise<Record<string, unknown>>;

const HANDLERS: Record<string, JobHandler> = {
  health_check: async () => ({
    ok: true,
    checkedAt: new Date().toISOString(),
    message: 'Worker alive',
  }),

  visit_url: async (job, browser) => {
    const payload = (job.payload || {}) as Record<string, unknown>;
    const url = String(payload.url || '').trim();
    if (!url) {
      throw new Error('visit_url thiếu payload.url');
    }
    const visited = await browser.visitUrl(url);
    return {
      ...visited,
      visitedAt: new Date().toISOString(),
    };
  },

  scan_source: async (job, browser) => runScanSourceJob(job, browser),

  /** @deprecated use scan_source */
  source_scan: async (job, browser) => runScanSourceJob(job, browser),

  publish_social: async (job, browser) => runPublishSocialJob(job, browser),
};

async function executeJob(job: AgentJob, browser: BrowserManager): Promise<Record<string, unknown>> {
  const handler = HANDLERS[job.type];
  if (!handler) {
    throw new Error(`Job type "${job.type}" chưa được triển khai.`);
  }
  return handler(job, browser);
}

function isResourceBusyError(error: unknown): boolean {
  if (error instanceof SlotBusyError || error instanceof SlotStoppedError || error instanceof BrowserBusyError) {
    return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return /^(SLOT_BUSY|SLOT_STOPPED|BROWSER_BUSY|CDP_BUSY)/.test(msg);
}

/**
 * Worker process loop — claims from existing AgentJob queue, then routes through
 * Execution Pool (slots) + Browser Pool (leases). Does not stop the process on
 * stopSlot / stopJob; only releases resources.
 */
export class WorkerLoop {
  private readonly inflight = new Map<string, Promise<void>>();
  /** Soft-reserves so fire-and-forget claim does not overbook a slot before acquire(). */
  private readonly reserved = new Map<string, number>();
  private running = false;

  constructor(
    private readonly config: WorkerConfig,
    private readonly browser: BrowserManager,
    private readonly executionPool: ExecutionPool,
    private readonly browserPool: BrowserPool,
  ) {}

  getCurrentJobId(): string | null {
    const ids = [...this.inflight.keys()];
    return ids[0] ?? null;
  }

  getInflightJobIds(): string[] {
    return [...this.inflight.keys()];
  }

  private reservedCount(kind: string): number {
    return this.reserved.get(kind) ?? 0;
  }

  private reserve(kind: string): void {
    this.reserved.set(kind, this.reservedCount(kind) + 1);
  }

  private unreserve(kind: string): void {
    const n = this.reservedCount(kind) - 1;
    if (n <= 0) this.reserved.delete(kind);
    else this.reserved.set(kind, n);
  }

  /** True if slot has room after counting in-flight reserves not yet in pool.running. */
  private canAccept(kind: string | null): boolean {
    if (!kind) return true;
    if (!this.executionPool.hasFreeCapacity(kind as Parameters<ExecutionPool['hasFreeCapacity']>[0])) {
      return false;
    }
    // Pool free by 1+; refuse if we already soft-reserved that last seat.
    const snap = this.executionPool.snapshot().find(s => s.kind === kind);
    if (!snap || snap.maxConcurrency <= 0 || snap.status === 'stopped') return false;
    return snap.runningJobs + this.reservedCount(kind) < snap.maxConcurrency;
  }

  private anyAcceptableSlot(): boolean {
    return this.executionPool.snapshot().some(s => this.canAccept(s.kind));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(
      `[agent-worker] Loop started — worker=${this.config.workerId} poll=${this.config.pollIntervalMs}ms ` +
        `(execution pool slots enabled)`,
    );

    while (this.running && !isShuttingDown()) {
      try {
        this.executionPool.tickHeartbeat();
        this.browserPool.tickHeartbeat();

        if (!this.anyAcceptableSlot()) {
          await sleep(this.config.pollIntervalMs);
          continue;
        }

        const job = await claimNextJob(this.config.workerId);
        if (!job) {
          await sleep(this.config.pollIntervalMs);
          continue;
        }

        const kind = slotKindForJobType(job.type);
        if (kind && !this.canAccept(kind)) {
          // Publish-free + scan-busy used to cause tight SLOT_BUSY claim loops.
          await releaseJobToQueue(
            job.id,
            `SLOT_BUSY: ${kind} — running=${this.executionPool.snapshot().find(s => s.kind === kind)?.runningJobs ?? '?'}/${this.executionPool.snapshot().find(s => s.kind === kind)?.maxConcurrency ?? '?'}`,
          );
          await sleep(this.config.pollIntervalMs);
          continue;
        }

        console.log(`[agent-worker] Claimed job ${job.id} type=${job.type}`);
        if (kind) this.reserve(kind);
        const run = this.dispatch(job).finally(() => {
          if (kind) this.unreserve(kind);
          this.inflight.delete(job.id);
        });
        this.inflight.set(job.id, run);

        // Opportunistically claim another job only when a different slot is free.
        if (!this.anyAcceptableSlot()) {
          await sleep(this.config.pollIntervalMs);
        }
      } catch (error) {
        console.error('[agent-worker] Loop error:', error);
        await sleep(this.config.pollIntervalMs);
      }
    }

    await Promise.allSettled([...this.inflight.values()]);
  }

  stop(): void {
    this.running = false;
  }

  /** Soft-stop a slot only — worker process keeps running. */
  stopSlot(kind: Parameters<ExecutionPool['stopSlot']>[0]): void {
    this.executionPool.stopSlot(kind);
    console.log(`[agent-worker] Slot stopped: ${kind}`);
  }

  startSlot(kind: Parameters<ExecutionPool['startSlot']>[0]): void {
    this.executionPool.startSlot(kind);
    console.log(`[agent-worker] Slot started: ${kind}`);
  }

  async stopJob(jobId: string, reason: string): Promise<void> {
    this.browserPool.releaseJob(jobId);
    this.executionPool.stopJob(jobId);
    await requeueRunningJob(jobId, reason);
    this.inflight.delete(jobId);
  }

  async releaseCurrentJob(reason: string): Promise<void> {
    const ids = this.getInflightJobIds();
    for (const id of ids) {
      this.browserPool.releaseJob(id);
      this.executionPool.stopJob(id);
      await requeueRunningJob(id, reason);
    }
    this.inflight.clear();
  }

  private async dispatch(job: AgentJob): Promise<void> {
    const kind = slotKindForJobType(job.type);
    let slotLease: SlotLease | null = null;
    let browserLease: BrowserLease | null = null;
    const startedAt = Date.now();

    try {
      if (!kind) {
        // health_check — no slot / browser lease
        const result = await executeJob(job, this.browser);
        await completeJob(job.id, {
          ...result,
          executionPool: { slot: null },
        });
        console.log(`[agent-worker] Completed job ${job.id}`);
        return;
      }

      await runtimeJobAls.run(
        {
          jobId: job.id,
          purpose: kind,
          missionRunId: job.missionRunId ?? null,
        },
        async () => {
          slotLease = await this.executionPool.acquire(kind, {
            jobId: job.id,
            missionRunId: job.missionRunId,
            workerId: this.config.workerId,
            waitTimeoutMs: 0,
          });

          browserLease = await this.browserPool.lease({
            purpose: kind,
            jobId: job.id,
            missionRunId: job.missionRunId,
            workerId: this.config.workerId,
          });

          try {
            const { emitRuntimeEventAsync } = await import('../modules/control-plane/runtimeEventBus');
            emitRuntimeEventAsync({
              type: 'BROWSER_LEASED',
              companyId: job.companyId,
              agentId: this.config.workerId,
              entityType: 'job',
              entityId: job.id,
              payload: { purpose: kind, browserId: browserLease.browserId },
            });
          } catch {
            /* ignore */
          }

          const result = await executeJob(job, this.browserPool.getManager());
          try {
            await completeJob(job.id, {
              ...result,
              executionPool: {
                slot: kind,
                slotLeaseId: slotLease.leaseId,
                browserLeaseId: browserLease.leaseId,
                browserId: browserLease.browserId,
              },
            });
            this.executionPool.recordOutcome(kind, 'completed', Date.now() - startedAt);
            console.log(`[agent-worker] Completed job ${job.id} slot=${kind}`);
          } catch (completeError) {
            const msg =
              completeError instanceof Error ? completeError.message : String(completeError);
            if (/Record to update not found|P2025/.test(msg)) {
              console.log(`[agent-worker] Job ${job.id} removed while running — skip complete`);
            } else {
              throw completeError;
            }
          }
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job thất bại.';
      if (kind && !isResourceBusyError(error)) {
        this.executionPool.recordOutcome(kind, 'failed', Date.now() - startedAt);
      }
      if (isResourceBusyError(error)) {
        console.log(`[agent-worker] Job ${job.id} deferred: ${message}`);
      } else {
        console.error(`[agent-worker] Job ${job.id} failed:`, message);
      }
      await releaseJobToQueue(job.id, message);
    } finally {
      try {
        if (browserLease) {
          browserLease.release();
          try {
            const { emitRuntimeEventAsync } = await import('../modules/control-plane/runtimeEventBus');
            emitRuntimeEventAsync({
              type: 'BROWSER_RELEASED',
              companyId: job.companyId,
              agentId: this.config.workerId,
              entityType: 'job',
              entityId: job.id,
              payload: { purpose: kind },
            });
            if (slotLease) {
              emitRuntimeEventAsync({
                type: 'SLOT_RELEASED',
                companyId: job.companyId,
                agentId: this.config.workerId,
                entityType: 'job',
                entityId: job.id,
                payload: { slot: kind },
              });
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
      try {
        slotLease?.release();
      } catch {
        /* ignore */
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
