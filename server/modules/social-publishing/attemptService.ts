import { Prisma, type SocialPublishAttempt } from '@prisma/client';
import { prisma } from '../../prisma';

export async function createAttemptStart(input: {
  companyId?: string | null;
  jobId: string;
  draftId: string;
  channelId: string;
  workerId?: string | null;
  attemptNumber: number;
}): Promise<SocialPublishAttempt> {
  return prisma.socialPublishAttempt.create({
    data: {
      companyId: input.companyId ?? null,
      jobId: input.jobId,
      draftId: input.draftId,
      channelId: input.channelId,
      workerId: input.workerId ?? null,
      attemptNumber: input.attemptNumber,
      status: 'started',
      startedAt: new Date(),
    },
  });
}

export async function finishAttemptSuccess(
  attemptId: string,
  input: {
    facebookPostId?: string | null;
    facebookPostUrl?: string | null;
    requestJson?: Record<string, unknown> | null;
    responseJson?: Record<string, unknown> | null;
    durationMs?: number | null;
  },
): Promise<SocialPublishAttempt> {
  const finishedAt = new Date();
  const existing = await prisma.socialPublishAttempt.findUnique({ where: { id: attemptId } });
  const durationMs =
    input.durationMs ??
    (existing ? Math.max(0, finishedAt.getTime() - existing.startedAt.getTime()) : null);

  return prisma.socialPublishAttempt.update({
    where: { id: attemptId },
    data: {
      status: 'success',
      finishedAt,
      durationMs,
      facebookPostId: input.facebookPostId ?? null,
      facebookPostUrl: input.facebookPostUrl ?? null,
      ...(input.requestJson !== undefined
        ? { requestJson: (input.requestJson ?? Prisma.JsonNull) as Prisma.InputJsonValue }
        : {}),
      ...(input.responseJson !== undefined
        ? { responseJson: (input.responseJson ?? Prisma.JsonNull) as Prisma.InputJsonValue }
        : {}),
      errorCode: null,
      errorMessage: null,
    },
  });
}

export async function finishAttemptFailure(
  attemptId: string,
  input: {
    status?: 'failed' | 'timeout';
    errorCode?: string | null;
    errorMessage?: string | null;
    requestJson?: Record<string, unknown> | null;
    responseJson?: Record<string, unknown> | null;
    durationMs?: number | null;
  },
): Promise<SocialPublishAttempt> {
  const finishedAt = new Date();
  const existing = await prisma.socialPublishAttempt.findUnique({ where: { id: attemptId } });
  const durationMs =
    input.durationMs ??
    (existing ? Math.max(0, finishedAt.getTime() - existing.startedAt.getTime()) : null);

  return prisma.socialPublishAttempt.update({
    where: { id: attemptId },
    data: {
      status: input.status || 'failed',
      finishedAt,
      durationMs,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      ...(input.requestJson !== undefined
        ? { requestJson: (input.requestJson ?? Prisma.JsonNull) as Prisma.InputJsonValue }
        : {}),
      ...(input.responseJson !== undefined
        ? { responseJson: (input.responseJson ?? Prisma.JsonNull) as Prisma.InputJsonValue }
        : {}),
    },
  });
}

export async function listAttemptsForJob(jobId: string, limit = 50) {
  return prisma.socialPublishAttempt.findMany({
    where: { jobId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
}

export async function listAttempts(input: {
  jobId?: string;
  channelId?: string;
  companyId?: string | null;
  limit?: number;
}) {
  return prisma.socialPublishAttempt.findMany({
    where: {
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.channelId ? { channelId: input.channelId } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
  });
}
