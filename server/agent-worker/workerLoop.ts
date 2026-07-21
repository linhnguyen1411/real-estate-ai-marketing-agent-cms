import type { AgentJob } from '@prisma/client';
import type { BrowserManager } from './browserManager';
import { isShuttingDown } from './gracefulShutdown';
import type { WorkerConfig } from './config';
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
import type { JobHandlerRegistry, JobQueuePort } from './ports';
import { createPrismaJobQueuePort } from './prismaJobQueue';
import { createDefaultJobHandlerRegistry } from './defaultHandlers';

function isResourceBusyError(error: unknown): boolean {
  if (error instanceof SlotBusyError || error instanceof SlotStoppedError || error instanceof BrowserBusyError) {
    return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return /^(SLOT_BUSY|SLOT_STOPPED|BROWSER_BUSY|CDP_BUSY)/.test(msg);
}

export type WorkerLoopDeps = {
  queue?: JobQueuePort;
  handlers?: JobHandlerRegistry;
  /** Declared agent capabilities for claim filtering */
  capabilities?: string[];
};

/**
 * Worker process loop — claims from JobQueuePort, routes through
 * Execution Pool (slots) + Browser Pool (leases). Pure orchestration.
 */
export class WorkerLoop {
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly reserved = new Map<string, number>();
  private readonly queue: JobQueuePort;
  private readonly handlers: JobHandlerRegistry;
  private readonly capabilities: string[];
  private running = false;

  constructor(
    private readonly config: WorkerConfig,
    private readonly browser: BrowserManager,
    private readonly executionPool: ExecutionPool,
    private readonly browserPool: BrowserPool,
    deps: WorkerLoopDeps = {},
  ) {
    this.queue = deps.queue ?? createPrismaJobQueuePort();
    this.handlers = deps.handlers ?? createDefaultJobHandlerRegistry();
    this.capabilities = deps.capabilities ?? [];
  }

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

  private canAccept(kind: string | null): boolean {
    if (!kind) return true;
    // Single Chrome profile: while publish owns CDP / is inflight, defer scan/visit.
    if (kind === 'scan' && this.publishOwnsChrome()) {
      return false;
    }
    if (!this.executionPool.hasFreeCapacity(kind as Parameters<ExecutionPool['hasFreeCapacity']>[0])) {
      return false;
    }
    const snap = this.executionPool.snapshot().find(s => s.kind === kind);
    if (!snap || snap.maxConcurrency <= 0 || snap.status === 'stopped') return false;
    return snap.runningJobs + this.reservedCount(kind) < snap.maxConcurrency;
  }

  private publishOwnsChrome(): boolean {
    return this.browser.isCdpBusy('publish') || this.reservedCount('publish') > 0;
  }

  private claimOptions(): {
    capabilities?: string[];
    preferTypes?: string[];
    excludeTypes?: string[];
  } {
    const capabilities = this.capabilities.length ? this.capabilities : undefined;
    const publishFree = this.canAccept('publish');
    const publishBusy = this.publishOwnsChrome();

    if (publishBusy) {
      return {
        capabilities,
        preferTypes: ['publish_social'],
        excludeTypes: ['scan_source', 'source_scan', 'visit_url'],
      };
    }

    if (publishFree) {
      // Prefer publish when capacity free; if none queued, claimer falls back to other types.
      return {
        capabilities,
        preferTypes: ['publish_social'],
      };
    }

    return { capabilities };
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
        const leaseTick = this.browserPool.tickHeartbeat();
        if (leaseTick.expired.length > 0) {
          try {
            const { emitRuntimeEventAsync } = await import(
              '../modules/control-plane/runtimeEventBus'
            );
            for (const e of leaseTick.expired) {
              emitRuntimeEventAsync({
                type: 'BROWSER_EXPIRED',
                agentId: this.config.workerId,
                entityType: 'browser',
                entityId: e.purpose,
                payload: {
                  purpose: e.purpose,
                  jobId: e.jobId,
                  reason: 'lease_ttl',
                },
              });
            }
          } catch {
            /* ignore */
          }
        }

        if (!this.anyAcceptableSlot()) {
          await sleep(this.config.pollIntervalMs);
          continue;
        }

        const job = await this.queue.claimNext(this.config.workerId, this.claimOptions());
        if (!job) {
          await sleep(this.config.pollIntervalMs);
          continue;
        }

        const kind = slotKindForJobType(job.type);
        if (kind && !this.canAccept(kind)) {
          const reason =
            kind === 'scan' && this.publishOwnsChrome()
              ? 'SLOT_BUSY: scan deferred — publish owns chrome profile'
              : `SLOT_BUSY: ${kind} — running=${this.executionPool.snapshot().find(s => s.kind === kind)?.runningJobs ?? '?'}/${this.executionPool.snapshot().find(s => s.kind === kind)?.maxConcurrency ?? '?'}`;
          await this.queue.release(job.id, reason);
          await sleep(this.config.pollIntervalMs);
          continue;
        }

        if (job.type === 'publish_social') {
          console.log(
            `[agent-worker] Publish priority — claiming ${job.id} (scan deferred until publish releases chrome)`,
          );
        }
        console.log(`[agent-worker] Claimed job ${job.id} type=${job.type}`);
        if (kind) this.reserve(kind);
        const run = this.dispatch(job).finally(() => {
          if (kind) this.unreserve(kind);
          this.inflight.delete(job.id);
        });
        this.inflight.set(job.id, run);

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
    await this.queue.requeue(jobId, reason);
    this.inflight.delete(jobId);
  }

  async releaseCurrentJob(reason: string): Promise<void> {
    const ids = this.getInflightJobIds();
    for (const id of ids) {
      this.browserPool.releaseJob(id);
      this.executionPool.stopJob(id);
      await this.queue.requeue(id, reason);
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
        const result = await this.handlers.execute(job, this.browser);
        await this.queue.complete(job.id, {
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
              payload: {
                purpose: kind,
                browserId: browserLease.browserId,
                leaseId: browserLease.leaseId,
                missionRunId: job.missionRunId ?? null,
                workerId: this.config.workerId,
              },
            });
          } catch {
            /* ignore */
          }

          const result = await this.handlers.execute(job, this.browserPool.getManager());
          try {
            await this.queue.complete(job.id, {
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
      await this.queue.release(job.id, message);
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
              payload: {
                purpose: kind,
                leaseId: browserLease.leaseId,
                browserId: browserLease.browserId,
              },
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
