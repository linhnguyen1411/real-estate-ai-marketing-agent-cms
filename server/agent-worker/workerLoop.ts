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
    throw new Error(
      `Job type "${job.type}" chưa được triển khai.`,
    );
  }
  return handler(job, browser);
}

export class WorkerLoop {
  private currentJobId: string | null = null;
  private running = false;

  constructor(
    private readonly config: WorkerConfig,
    private readonly browser: BrowserManager,
  ) {}

  getCurrentJobId(): string | null {
    return this.currentJobId;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(
      `[agent-worker] Loop started — worker=${this.config.workerId} poll=${this.config.pollIntervalMs}ms`,
    );

    while (this.running && !isShuttingDown()) {
      try {
        const job = await claimNextJob(this.config.workerId);
        if (!job) {
          await sleep(this.config.pollIntervalMs);
          continue;
        }

        this.currentJobId = job.id;
        console.log(`[agent-worker] Claimed job ${job.id} type=${job.type}`);

        try {
          const result = await executeJob(job, this.browser);
          try {
            await completeJob(job.id, result);
            console.log(`[agent-worker] Completed job ${job.id}`);
          } catch (completeError) {
            const msg = completeError instanceof Error ? completeError.message : String(completeError);
            if (/Record to update not found|P2025/.test(msg)) {
              console.log(`[agent-worker] Job ${job.id} removed while running — skip complete`);
            } else {
              throw completeError;
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Job thất bại.';
          console.error(`[agent-worker] Job ${job.id} failed:`, message);
          await releaseJobToQueue(job.id, message);
        } finally {
          this.currentJobId = null;
        }
      } catch (error) {
        console.error('[agent-worker] Loop error:', error);
        await sleep(this.config.pollIntervalMs);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  async releaseCurrentJob(reason: string): Promise<void> {
    if (!this.currentJobId) return;
    await requeueRunningJob(this.currentJobId, reason);
    this.currentJobId = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
