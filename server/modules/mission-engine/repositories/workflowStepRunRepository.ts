import type { AgentWorkflowStepRun, Prisma } from '@prisma/client';
import { prisma } from '../../../prisma';
import type { StepRunStatus } from '../domain/workflowTypes';
import { buildStepIdempotencyKey } from './missionRunRepository';

export async function findStepRunByIdempotencyKey(key: string) {
  return prisma.agentWorkflowStepRun.findUnique({ where: { idempotencyKey: key } });
}

export async function ensureStepRun(input: {
  companyId: string | null;
  missionRunId: string;
  missionId: string;
  jobId?: string | null;
  sourceId?: string | null;
  scannedContentId?: string | null;
  stepId: string;
  stepType: string;
  pipelineVersion: number;
  maxAttempts?: number;
  inputRef?: Record<string, unknown> | null;
}): Promise<{ record: AgentWorkflowStepRun; created: boolean }> {
  const idempotencyKey = buildStepIdempotencyKey({
    missionRunId: input.missionRunId,
    scannedContentId: input.scannedContentId,
    jobId: input.jobId,
    stepId: input.stepId,
    pipelineVersion: input.pipelineVersion,
  });

  const existing = await prisma.agentWorkflowStepRun.findUnique({ where: { idempotencyKey } });
  if (existing) return { record: existing, created: false };

  try {
    const record = await prisma.agentWorkflowStepRun.create({
      data: {
        companyId: input.companyId,
        missionRunId: input.missionRunId,
        missionId: input.missionId,
        jobId: input.jobId ?? null,
        sourceId: input.sourceId ?? null,
        scannedContentId: input.scannedContentId ?? null,
        stepId: input.stepId,
        stepType: input.stepType,
        status: 'pending',
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        idempotencyKey,
        inputRef: (input.inputRef ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return { record, created: true };
  } catch (err) {
    // Unique race
    const again = await prisma.agentWorkflowStepRun.findUnique({ where: { idempotencyKey } });
    if (again) return { record: again, created: false };
    throw err;
  }
}

export async function markStepRunning(id: string) {
  return prisma.agentWorkflowStepRun.update({
    where: { id },
    data: {
      status: 'running',
      attempts: { increment: 1 },
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });
}

export async function markStepTerminal(
  id: string,
  input: {
    status: StepRunStatus;
    output?: unknown;
    findingId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: Date | null;
  },
) {
  const startedAt = input.startedAt ?? undefined;
  const completedAt = new Date();
  const durationMs =
    startedAt instanceof Date ? Math.max(0, completedAt.getTime() - startedAt.getTime()) : null;

  return prisma.agentWorkflowStepRun.update({
    where: { id },
    data: {
      status: input.status,
      output: (input.output ?? undefined) as Prisma.InputJsonValue | undefined,
      findingId: input.findingId ?? undefined,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      completedAt,
      durationMs: durationMs ?? undefined,
    },
  });
}

export async function listStepRunsForMissionRun(missionRunId: string) {
  return prisma.agentWorkflowStepRun.findMany({
    where: { missionRunId },
    orderBy: [{ createdAt: 'asc' }, { stepId: 'asc' }],
  });
}

export async function listStaleRunningSteps(input: {
  olderThan: Date;
  limit?: number;
}) {
  return prisma.agentWorkflowStepRun.findMany({
    where: {
      status: { in: ['running', 'retrying'] },
      startedAt: { lt: input.olderThan },
    },
    take: input.limit ?? 100,
    orderBy: { startedAt: 'asc' },
  });
}

export async function cancelPendingSteps(missionRunId: string) {
  return prisma.agentWorkflowStepRun.updateMany({
    where: {
      missionRunId,
      status: { in: ['pending', 'retrying'] },
    },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
      errorCode: 'run_cancelled',
      errorMessage: 'Mission run cancelled',
    },
  });
}
