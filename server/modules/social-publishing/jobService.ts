import { Prisma, type SocialPublishJob } from '@prisma/client';
import { prisma } from '../../prisma';
import { appendAuditLog } from './auditService';
import { recordFailure, recordSuccess } from './channelService';
import {
  notifyPublishFailure,
  notifyPublishSuccess,
} from './notificationBridge';
import { assertChannelPublishable, checkDailyCap, checkDuplicate, checkSpacing } from './safetyService';
import {
  ACTIVE_JOB_STATUSES,
  AGENT_JOB_TYPE_PUBLISH_SOCIAL,
  DEFAULT_SAFETY_SETTINGS,
  type PublishErrorCode,
  type PublishResult,
} from './types';

export function buildIdempotencyKey(
  draftId: string,
  channelId: string,
  scheduledAt: Date,
): string {
  return `${draftId}:${channelId}:${scheduledAt.toISOString()}`;
}

/** Pure: retry must not republish an already-published job. */
export function shouldSkipRetry(job: {
  status: string;
  result?: unknown;
}): { skip: boolean; reason?: 'already_published' } {
  if (job.status === 'published') {
    return { skip: true, reason: 'already_published' };
  }
  const result = (job.result || {}) as Record<string, unknown>;
  if (result.externalPostId) {
    return { skip: true, reason: 'already_published' };
  }
  return { skip: false };
}

export async function createPublishJob(input: {
  companyId?: string | null;
  draftId: string;
  channelId: string;
  scheduledAt: Date;
  actor?: string | null;
}): Promise<SocialPublishJob> {
  const channel = await prisma.socialChannel.findUnique({ where: { id: input.channelId } });
  if (!channel) throw new Error('Channel not found');
  const publishable = assertChannelPublishable(channel);
  if (!publishable.ok) {
    throw new Error(publishable.errorMessage || publishable.errorCode || 'Channel not publishable');
  }

  const draft = await prisma.socialPostDraft.findUnique({ where: { id: input.draftId } });
  if (!draft) throw new Error('Draft not found');

  const dup = await checkDuplicate({
    companyId: input.companyId ?? draft.companyId,
    channelId: input.channelId,
    bodyHash: draft.bodyHash,
    normalizedHash: draft.normalizedBodyHash,
    windowDays: DEFAULT_SAFETY_SETTINGS.duplicateWindowDays,
  });
  if (dup.duplicate) {
    throw new Error(`Duplicate content within window (job ${dup.matchedJobId})`);
  }

  const idempotencyKey = buildIdempotencyKey(input.draftId, input.channelId, input.scheduledAt);
  const existing = await prisma.socialPublishJob.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.status === 'published') return existing;
    if (['queued', 'claimed', 'preparing', 'publishing'].includes(existing.status)) {
      return existing;
    }
  }

  try {
    const job = await prisma.socialPublishJob.create({
      data: {
        companyId: input.companyId ?? draft.companyId ?? channel.companyId,
        draftId: input.draftId,
        channelId: input.channelId,
        scheduledAt: input.scheduledAt,
        status: 'queued',
        idempotencyKey,
      },
    });
    await appendAuditLog({
      companyId: job.companyId,
      entityType: 'SocialPublishJob',
      entityId: job.id,
      action: 'created',
      actor: input.actor,
      metadata: { idempotencyKey, scheduledAt: input.scheduledAt.toISOString() },
    });
    return job;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const again = await prisma.socialPublishJob.findUnique({ where: { idempotencyKey } });
      if (again) return again;
    }
    throw error;
  }
}

export async function listJobs(input: {
  companyId?: string | null;
  status?: string;
  channelId?: string;
  draftId?: string;
  limit?: number;
}) {
  return prisma.socialPublishJob.findMany({
    where: {
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.channelId ? { channelId: input.channelId } : {}),
      ...(input.draftId ? { draftId: input.draftId } : {}),
    },
    include: {
      draft: { select: { id: true, title: true, status: true, body: true } },
      channel: { select: { id: true, name: true, type: true, status: true } },
    },
    orderBy: { scheduledAt: 'desc' },
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
  });
}

export async function getJobById(id: string) {
  return prisma.socialPublishJob.findUnique({
    where: { id },
    include: {
      draft: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
      channel: true,
    },
  });
}

export async function cancelJob(id: string, actor?: string | null) {
  const job = await prisma.socialPublishJob.findUnique({ where: { id } });
  if (!job) throw new Error('Job not found');
  if (['published', 'cancelled'].includes(job.status)) {
    throw new Error(`Cannot cancel job in status ${job.status}`);
  }
  if (ACTIVE_JOB_STATUSES.includes(job.status as (typeof ACTIVE_JOB_STATUSES)[number])) {
    throw new Error('Cannot cancel job that is already publishing');
  }
  const updated = await prisma.socialPublishJob.update({
    where: { id },
    data: { status: 'cancelled', completedAt: new Date() },
  });
  await appendAuditLog({
    companyId: job.companyId,
    entityType: 'SocialPublishJob',
    entityId: id,
    action: 'cancelled',
    actor,
  });
  return updated;
}

export async function retryJob(id: string, actor?: string | null) {
  const job = await getJobById(id);
  if (!job) throw new Error('Job not found');
  const skipCheck = shouldSkipRetry(job);
  if (skipCheck.skip) {
    return { job, skipped: true as const, reason: skipCheck.reason! };
  }

  const updated = await prisma.socialPublishJob.update({
    where: { id },
    data: {
      status: 'queued',
      scheduledAt: new Date(),
      errorCode: null,
      errorMessage: null,
      claimedBy: null,
      startedAt: null,
      completedAt: null,
    },
  });

  await enqueueAgentJobForPublishJob(updated);
  await appendAuditLog({
    companyId: job.companyId,
    entityType: 'SocialPublishJob',
    entityId: id,
    action: 'retried',
    actor,
  });
  return { job: updated, skipped: false as const };
}

/**
 * Scheduler: for due SocialPublishJob rows, create AgentJob publish_social
 * if none active for that publishJobId.
 */
export async function enqueueDueSocialPublishJobs(now = new Date()): Promise<{
  due: number;
  created: number;
  skipped: number;
}> {
  const dueJobs = await prisma.socialPublishJob.findMany({
    where: {
      status: 'queued',
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 50,
  });

  let created = 0;
  let skipped = 0;

  for (const job of dueJobs) {
    const didCreate = await enqueueAgentJobForPublishJob(job);
    if (didCreate) created += 1;
    else skipped += 1;
  }

  return { due: dueJobs.length, created, skipped };
}

export async function enqueueAgentJobForPublishJob(
  job: Pick<SocialPublishJob, 'id' | 'companyId'>,
): Promise<boolean> {
  const active = await prisma.agentJob.findFirst({
    where: {
      type: AGENT_JOB_TYPE_PUBLISH_SOCIAL,
      status: { in: ['queued', 'claimed', 'running'] },
      payload: {
        path: ['publishJobId'],
        equals: job.id,
      },
    },
    select: { id: true },
  });
  if (active) return false;

  await prisma.agentJob.create({
    data: {
      companyId: job.companyId,
      type: AGENT_JOB_TYPE_PUBLISH_SOCIAL,
      status: 'queued',
      priority: 5,
      availableAt: new Date(),
      payload: {
        publishJobId: job.id,
        triggeredBy: 'social_publish_scheduler',
      },
    },
  });
  return true;
}

export async function claimPublishJob(
  id: string,
  workerId: string,
): Promise<SocialPublishJob | null> {
  return prisma.$transaction(async tx => {
    const job = await tx.socialPublishJob.findUnique({ where: { id } });
    if (!job) return null;

    if (job.status === 'published') return job;
    if (!['queued', 'failed'].includes(job.status) && job.status !== 'claimed') {
      if (ACTIVE_JOB_STATUSES.includes(job.status as (typeof ACTIVE_JOB_STATUSES)[number])) {
        if (job.claimedBy === workerId) return job;
        return null;
      }
    }

    const activeOnChannel = await tx.socialPublishJob.findFirst({
      where: {
        channelId: job.channelId,
        id: { not: id },
        status: { in: [...ACTIVE_JOB_STATUSES] },
      },
      select: { id: true },
    });
    if (activeOnChannel) {
      throw Object.assign(new Error('Channel has another active publish job'), {
        code: 'channel_locked' as PublishErrorCode,
      });
    }

    return tx.socialPublishJob.update({
      where: { id },
      data: {
        status: 'publishing',
        claimedBy: workerId,
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  });
}

export async function completePublishJob(
  id: string,
  result: PublishResult,
): Promise<SocialPublishJob> {
  const job = await prisma.socialPublishJob.update({
    where: { id },
    data: {
      status: 'published',
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      result: result as unknown as Prisma.InputJsonValue,
      claimedBy: null,
    },
  });

  await prisma.socialPostDraft.update({
    where: { id: job.draftId },
    data: { status: 'published' },
  });

  await recordSuccess(job.channelId);
  await notifyPublishSuccess({
    companyId: job.companyId,
    publishJobId: job.id,
    channelId: job.channelId,
    externalPostId: result.externalPostId,
  });
  await appendAuditLog({
    companyId: job.companyId,
    entityType: 'SocialPublishJob',
    entityId: id,
    action: 'published',
    metadata: result as unknown as Record<string, unknown>,
  });
  return job;
}

export async function failPublishJob(
  id: string,
  errorCode: PublishErrorCode | string,
  errorMessage: string,
): Promise<SocialPublishJob> {
  const existing = await prisma.socialPublishJob.findUnique({ where: { id } });
  if (!existing) throw new Error('Job not found');

  const exhausted = existing.attempts >= existing.maxAttempts;
  const job = await prisma.socialPublishJob.update({
    where: { id },
    data: {
      status: exhausted ? 'failed' : 'queued',
      errorCode,
      errorMessage,
      completedAt: exhausted ? new Date() : null,
      claimedBy: null,
      startedAt: null,
      ...(exhausted
        ? {}
        : {
            scheduledAt: new Date(
              Date.now() + Math.min(60_000 * 2 ** Math.max(0, existing.attempts - 1), 30 * 60_000),
            ),
          }),
    },
  });

  await recordFailure(job.channelId, errorCode, errorMessage);
  await notifyPublishFailure({
    companyId: job.companyId,
    publishJobId: job.id,
    channelId: job.channelId,
    errorCode,
    errorMessage,
  });
  await appendAuditLog({
    companyId: job.companyId,
    entityType: 'SocialPublishJob',
    entityId: id,
    action: exhausted ? 'failed' : 'requeued',
    metadata: { errorCode, errorMessage, attempts: job.attempts },
  });
  return job;
}

export async function runPrePublishSafetyChecks(jobId: string): Promise<{
  ok: boolean;
  errorCode?: PublishErrorCode;
  errorMessage?: string;
}> {
  const job = await getJobById(jobId);
  if (!job) return { ok: false, errorCode: 'unknown', errorMessage: 'Job not found' };

  if (job.status === 'published') {
    return { ok: false, errorCode: 'already_published', errorMessage: 'Already published' };
  }
  const prior = (job.result || {}) as Record<string, unknown>;
  if (prior.externalPostId) {
    return { ok: false, errorCode: 'already_published', errorMessage: 'Result already has externalPostId' };
  }

  const publishable = assertChannelPublishable(job.channel);
  if (!publishable.ok) {
    return {
      ok: false,
      errorCode: publishable.errorCode,
      errorMessage: publishable.errorMessage,
    };
  }

  const cap = await checkDailyCap(job.channelId);
  if (!cap.allowed) {
    return {
      ok: false,
      errorCode: 'daily_cap',
      errorMessage: `Daily cap reached (${cap.count}/${cap.max})`,
    };
  }

  const spacing = await checkSpacing(job.channelId);
  if (!spacing.allowed) {
    return {
      ok: false,
      errorCode: 'spacing',
      errorMessage: `Min spacing ${spacing.minSpacingMinutes}m not met`,
    };
  }

  const dup = await checkDuplicate({
    companyId: job.companyId,
    channelId: job.channelId,
    bodyHash: job.draft.bodyHash,
    normalizedHash: job.draft.normalizedBodyHash,
  });
  if (dup.duplicate) {
    return {
      ok: false,
      errorCode: 'duplicate',
      errorMessage: `Duplicate of job ${dup.matchedJobId}`,
    };
  }

  return { ok: true };
}
