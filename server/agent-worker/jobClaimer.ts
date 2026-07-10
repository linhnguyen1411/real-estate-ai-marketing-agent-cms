import type { AgentJob } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export type ClaimedJob = AgentJob;

/**
 * Atomically claim the next queued job using PostgreSQL row locking (SKIP LOCKED).
 * Priority: lower number = higher priority; then oldest createdAt.
 */
export async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM agent_jobs
      WHERE status = 'queued'
        AND available_at <= NOW()
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    const jobId = rows[0]?.id;
    if (!jobId) return null;

    return tx.agentJob.update({
      where: { id: jobId },
      data: {
        status: 'running',
        claimedBy: workerId,
        claimedAt: new Date(),
        startedAt: new Date(),
      },
    });
  });
}

export async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  await prisma.agentJob.update({
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
}

export async function releaseJobToQueue(jobId: string, errorMessage: string): Promise<void> {
  const job = await prisma.agentJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const nextAttempts = job.attempts + 1;

  if (nextAttempts < job.maxAttempts) {
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
      attempts: nextAttempts,
      finishedAt: new Date(),
      errorMessage,
      claimedBy: null,
      claimedAt: null,
    },
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
