import type { AgentJob } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { notifyJobFailed } from '../agent/agentNotificationService';
import { prisma } from '../prisma';
import { isNonRetryableBrowserErrorMessage } from './facebook/facebookCheckpointDetector';
import { emitRuntimeEventAsync } from '../modules/control-plane/runtimeEventBus';

export type ClaimedJob = AgentJob;

/**
 * Atomically claim the next queued job using PostgreSQL row locking (SKIP LOCKED).
 * Priority: lower number = higher priority; then oldest createdAt.
 * Multi-agent prep: jobs with payload.targetAgentId only match that worker.
 */
export async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM agent_jobs
      WHERE status = 'queued'
        AND available_at <= NOW()
        AND (
          payload->>'targetAgentId' IS NULL
          OR payload->>'targetAgentId' = ''
          OR payload->>'targetAgentId' = ${workerId}
        )
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    const jobId = rows[0]?.id;
    if (!jobId) return null;

    const job = await tx.agentJob.update({
      where: { id: jobId },
      data: {
        status: 'running',
        claimedBy: workerId,
        claimedAt: new Date(),
        startedAt: new Date(),
      },
    });

    emitRuntimeEventAsync({
      type: 'JOB_CLAIMED',
      companyId: job.companyId,
      agentId: workerId,
      entityType: 'job',
      entityId: job.id,
      payload: { type: job.type, missionRunId: job.missionRunId },
    });

    return job;
  });
}

export async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  const existing = await prisma.agentJob.findUnique({ where: { id: jobId } });
  const job = await prisma.agentJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      result: result as Prisma.InputJsonValue,
      finishedAt: new Date(),
      errorMessage: null,
      claimedBy: null,
      claimedAt: null,
    },
  });
  emitRuntimeEventAsync({
    type: 'JOB_COMPLETED',
    companyId: job.companyId,
    agentId: existing?.claimedBy ?? null,
    entityType: 'job',
    entityId: job.id,
    payload: { type: job.type, missionRunId: job.missionRunId },
  });
}

export async function releaseJobToQueue(jobId: string, errorMessage: string): Promise<void> {
  const job = await prisma.agentJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  // CDP busy / slot / browser busy — defer without burning attempts
  if (/^(CDP_BUSY|SLOT_BUSY|SLOT_STOPPED|BROWSER_BUSY)/.test(errorMessage)) {
    await prisma.agentJob.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        availableAt: new Date(Date.now() + 15_000),
        claimedBy: null,
        claimedAt: null,
        startedAt: null,
        errorMessage: errorMessage.slice(0, 500),
      },
    });
    if (/^SLOT_BUSY/.test(errorMessage)) {
      emitRuntimeEventAsync({
        type: 'SLOT_BUSY',
        companyId: job.companyId,
        agentId: job.claimedBy,
        entityType: 'job',
        entityId: jobId,
        payload: { errorMessage: errorMessage.slice(0, 200) },
      });
    }
    return;
  }

  const nextAttempts = job.attempts + 1;
  const nonRetryable = isNonRetryableBrowserErrorMessage(errorMessage);

  if (!nonRetryable && nextAttempts < job.maxAttempts) {
    const backoffMs = Math.min(60_000 * 2 ** Math.max(0, nextAttempts - 1), 30 * 60_000);
    await prisma.agentJob.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        attempts: nextAttempts,
        availableAt: new Date(Date.now() + backoffMs),
        claimedBy: null,
        claimedAt: null,
        startedAt: null,
        errorMessage,
      },
    });
    return;
  }

  await prisma.agentJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      attempts: nonRetryable ? job.maxAttempts : nextAttempts,
      finishedAt: new Date(),
      errorMessage,
      claimedBy: null,
      claimedAt: null,
    },
  });

  emitRuntimeEventAsync({
    type: 'JOB_FAILED',
    companyId: job.companyId,
    agentId: job.claimedBy,
    entityType: 'job',
    entityId: job.id,
    payload: { type: job.type, errorMessage: errorMessage.slice(0, 200) },
  });

  await notifyJobFailed({
    companyId: job.companyId,
    jobId: job.id,
    jobType: job.type,
    sourceId: job.sourceId,
    errorMessage,
    attempts: nonRetryable ? job.maxAttempts : nextAttempts,
  });
}

/** Requeue a running job without incrementing attempts (graceful shutdown). */
export async function requeueRunningJob(jobId: string, reason: string): Promise<void> {
  await prisma.agentJob.updateMany({
    where: { id: jobId, status: 'running' },
    data: {
      status: 'queued',
      claimedBy: null,
      claimedAt: null,
      startedAt: null,
      availableAt: new Date(Date.now() + 5_000),
      errorMessage: reason,
    },
  });
}

/**
 * Recover jobs left in claimed/running after a hard worker kill (no graceful shutdown).
 * Called once on worker boot. Does not change business publish semantics.
 */
export async function reclaimOrphanedAgentJobs(input: {
  workerId: string;
  staleMs?: number;
}): Promise<number> {
  const staleMs = input.staleMs ?? 90_000;
  const cutoff = new Date(Date.now() - staleMs);
  const result = await prisma.agentJob.updateMany({
    where: {
      status: { in: ['claimed', 'running'] },
      OR: [
        { startedAt: { lt: cutoff } },
        { claimedAt: { lt: cutoff } },
        {
          AND: [{ startedAt: null }, { claimedAt: null }, { updatedAt: { lt: cutoff } }],
        },
      ],
      // Never steal a job this same process just claimed
      NOT: { claimedBy: input.workerId },
    },
    data: {
      status: 'queued',
      claimedBy: null,
      claimedAt: null,
      startedAt: null,
      availableAt: new Date(),
      errorMessage: 'Reclaimed orphaned running job after worker death',
    },
  });
  return result.count;
}
