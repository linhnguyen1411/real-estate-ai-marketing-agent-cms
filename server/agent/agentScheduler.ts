import { checkStaleBrowserSessions } from './agentNotificationService';
import { prisma } from '../prisma';

/** Fixed class/id pair for pg_try_advisory_xact_lock (agent scheduler). */
export const AGENT_SCHEDULER_LOCK_CLASS = 41871;
export const AGENT_SCHEDULER_LOCK_ID = 1;

export const AGENT_SCHEDULER_TICK_MS = 60_000;
export const AGENT_SCHEDULER_TRIGGERED_BY = 'scheduler';

export interface SchedulerStatus {
  enabled: boolean;
  running: boolean;
  tickIntervalMs: number;
  lastTickAt: string | null;
  lastTickResult: SchedulerTickResult | null;
  lastError: string | null;
  startedAt: string | null;
}

export interface SchedulerTickResult {
  skipped: boolean;
  reason?: 'disabled' | 'lock_held' | 'already_running';
  sourcesDue: number;
  jobsCreated: number;
  jobsSkippedDuplicate: number;
  sourceIdsEnqueued: string[];
  durationMs: number;
  tickAt: string;
}

export interface SourceEnqueueDecisionInput {
  sourceStatus: string;
  nextScanAt: Date | null;
  now: Date;
  hasActiveScanJob: boolean;
}

/**
 * Pure decision: should scheduler enqueue a scan_source for this source?
 * Used by unit tests for duplicate prevention.
 */
export function shouldEnqueueSourceScan(input: SourceEnqueueDecisionInput): boolean {
  if (input.sourceStatus !== 'active') return false;
  if (input.hasActiveScanJob) return false;
  if (input.nextScanAt && input.nextScanAt.getTime() > input.now.getTime()) return false;
  return true;
}

export function computeNextScanAt(from: Date, scanIntervalMinutes: number): Date {
  const raw = Math.floor(Number(scanIntervalMinutes));
  const minutes = Number.isFinite(raw) && raw >= 1 ? raw : 60;
  return new Date(from.getTime() + minutes * 60_000);
}

let timer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
let startedAt: Date | null = null;
let lastTickAt: Date | null = null;
let lastTickResult: SchedulerTickResult | null = null;
let lastError: string | null = null;

export function isAgentSchedulerEnabled(): boolean {
  const raw = process.env.AGENT_SCHEDULER_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function getAgentSchedulerStatus(): SchedulerStatus {
  return {
    enabled: isAgentSchedulerEnabled(),
    running: timer !== null,
    tickIntervalMs: AGENT_SCHEDULER_TICK_MS,
    lastTickAt: lastTickAt?.toISOString() ?? null,
    lastTickResult,
    lastError,
    startedAt: startedAt?.toISOString() ?? null,
  };
}

/**
 * One scheduler tick. Uses PostgreSQL transaction-scoped advisory lock so only
 * one web instance executes the enqueue work. Never opens a browser.
 */
export async function runAgentSchedulerTick(now = new Date()): Promise<SchedulerTickResult> {
  const tickAt = now.toISOString();
  const started = Date.now();

  if (!isAgentSchedulerEnabled()) {
    return {
      skipped: true,
      reason: 'disabled',
      sourcesDue: 0,
      jobsCreated: 0,
      jobsSkippedDuplicate: 0,
      sourceIdsEnqueued: [],
      durationMs: Date.now() - started,
      tickAt,
    };
  }

  if (tickInFlight) {
    return {
      skipped: true,
      reason: 'already_running',
      sourcesDue: 0,
      jobsCreated: 0,
      jobsSkippedDuplicate: 0,
      sourceIdsEnqueued: [],
      durationMs: Date.now() - started,
      tickAt,
    };
  }

  tickInFlight = true;
  try {
    const result = await prisma.$transaction(async tx => {
      const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${AGENT_SCHEDULER_LOCK_CLASS}, ${AGENT_SCHEDULER_LOCK_ID}) AS locked
      `;
      if (!lockRows[0]?.locked) {
        return {
          skipped: true as const,
          reason: 'lock_held' as const,
          sourcesDue: 0,
          jobsCreated: 0,
          jobsSkippedDuplicate: 0,
          sourceIdsEnqueued: [] as string[],
          durationMs: 0,
          tickAt,
        };
      }

      const dueSources = await tx.agentSource.findMany({
        where: {
          status: 'active',
          OR: [{ nextScanAt: null }, { nextScanAt: { lte: now } }],
        },
        orderBy: [{ priority: 'asc' }, { nextScanAt: 'asc' }],
        take: 50,
      });

      let jobsCreated = 0;
      let jobsSkippedDuplicate = 0;
      const sourceIdsEnqueued: string[] = [];

      for (const source of dueSources) {
        const activeJob = await tx.agentJob.findFirst({
          where: {
            sourceId: source.id,
            type: 'scan_source',
            status: { in: ['queued', 'claimed', 'running'] },
          },
          select: { id: true },
        });

        const decide = shouldEnqueueSourceScan({
          sourceStatus: source.status,
          nextScanAt: source.nextScanAt,
          now,
          hasActiveScanJob: Boolean(activeJob),
        });

        if (!decide) {
          jobsSkippedDuplicate += 1;
          continue;
        }

        await tx.agentJob.create({
          data: {
            companyId: source.companyId,
            sourceId: source.id,
            type: 'scan_source',
            status: 'queued',
            priority: source.priority,
            availableAt: now,
            payload: {
              sourceId: source.id,
              triggeredBy: AGENT_SCHEDULER_TRIGGERED_BY,
              enqueuedAt: now.toISOString(),
            },
          },
        });

        const nextScanAt = computeNextScanAt(now, source.scanIntervalMinutes);
        await tx.agentSource.update({
          where: { id: source.id },
          data: { nextScanAt },
        });

        jobsCreated += 1;
        sourceIdsEnqueued.push(source.id);
      }

      return {
        skipped: false as const,
        sourcesDue: dueSources.length,
        jobsCreated,
        jobsSkippedDuplicate,
        sourceIdsEnqueued,
        durationMs: 0,
        tickAt,
      };
    }, { timeout: 25_000, maxWait: 5_000 });

    const finalResult: SchedulerTickResult = {
      ...result,
      durationMs: Date.now() - started,
    };
    lastTickAt = now;
    lastTickResult = finalResult;
    lastError = null;

    if (!finalResult.skipped) {
      try {
        await checkStaleBrowserSessions({ staleMs: 90_000 });
      } catch (error) {
        console.warn(
          '[agent-scheduler] Stale session check failed:',
          error instanceof Error ? error.message : error,
        );
      }
    }

    return finalResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scheduler tick failed';
    lastError = message;
    lastTickAt = now;
    throw error;
  } finally {
    tickInFlight = false;
  }
}

export function startAgentScheduler(): void {
  if (!isAgentSchedulerEnabled()) {
    console.log('[agent-scheduler] Disabled (AGENT_SCHEDULER_ENABLED≠true)');
    return;
  }
  if (timer) {
    console.log('[agent-scheduler] Already running');
    return;
  }

  startedAt = new Date();
  console.log(`[agent-scheduler] Starting — tick every ${AGENT_SCHEDULER_TICK_MS / 1000}s`);

  const safeTick = () => {
    void runAgentSchedulerTick().then(result => {
      if (result.skipped) {
        if (result.reason === 'lock_held') {
          console.log('[agent-scheduler] Tick skipped — another instance holds lock');
        }
        return;
      }
      if (result.jobsCreated > 0 || result.sourcesDue > 0) {
        console.log(
          `[agent-scheduler] Tick: due=${result.sourcesDue} created=${result.jobsCreated} skippedDup=${result.jobsSkippedDuplicate} ${result.durationMs}ms`,
        );
      }
    }).catch(error => {
      console.error('[agent-scheduler] Tick error:', error instanceof Error ? error.message : error);
    });
  };

  // First tick shortly after boot, then every 60s
  setTimeout(safeTick, 5_000);
  timer = setInterval(safeTick, AGENT_SCHEDULER_TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopAgentScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[agent-scheduler] Stopped');
  }
}
