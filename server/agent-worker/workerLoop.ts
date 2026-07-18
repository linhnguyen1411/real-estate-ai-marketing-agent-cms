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

        if (!this.executionPool.hasFreeCapacity()) {
          await sleep(this.config.pollIntervalMs);
          continue;
        }

        const job = await claimNextJob(this.config.workerId);
        if (!job) {
          await sleep(this.config.pollIntervalMs);
          continue;
        }

        console.log(`[agent-worker] Claimed job ${job.id} type=${job.type}`);
        const run = this.dispatch(job).finally(() => {
          this.inflight.delete(job.id);
        });
        this.inflight.set(job.id, run);

        // Opportunistically claim another job for a free slot (scan ∥ publish).
        continue;
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
      if (isResourceBusyError(error)) {
        console.log(`[agent-worker] Job ${job.id} deferred: ${message}`);
      } else {
        console.error(`[agent-worker] Job ${job.id} failed:`, message);
      }
      await releaseJobToQueue(job.id, message);
    } finally {
      try {
        browserLease?.release();
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
