import type { AgentMissionRun, AgentWorkflowStepRun, Prisma } from '@prisma/client';
import { prisma } from '../../../prisma';
import type { MissionRunStatus, WorkflowPipelineDefinition } from '../domain/workflowTypes';

export async function createMissionRun(input: {
  companyId: string | null;
  missionId: string;
  missionVersion: number;
  pipelineSnapshot: WorkflowPipelineDefinition;
  pipelineHash?: string | null;
  triggerType: string;
  triggeredBy?: string | null;
  status?: MissionRunStatus;
}): Promise<AgentMissionRun> {
  return prisma.agentMissionRun.create({
    data: {
      companyId: input.companyId,
      missionId: input.missionId,
      missionVersion: input.missionVersion,
      pipelineSnapshot: input.pipelineSnapshot as unknown as Prisma.InputJsonValue,
      pipelineHash: input.pipelineHash ?? null,
      status: input.status ?? 'queued',
      triggerType: input.triggerType,
      triggeredBy: input.triggeredBy ?? null,
      metrics: {},
    },
  });
}

export async function getMissionRunById(id: string) {
  return prisma.agentMissionRun.findUnique({
    where: { id },
    include: {
      mission: { select: { id: true, name: true, status: true, templateKey: true } },
      jobs: {
        select: {
          id: true,
          sourceId: true,
          status: true,
          type: true,
          errorMessage: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });
}

export async function listMissionRuns(input: {
  missionId: string;
  companyId?: string | null;
  skip?: number;
  take?: number;
}) {
  const where: Prisma.AgentMissionRunWhereInput = {
    missionId: input.missionId,
    ...(input.companyId ? { companyId: input.companyId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.agentMissionRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: input.skip ?? 0,
      take: input.take ?? 20,
    }),
    prisma.agentMissionRun.count({ where }),
  ]);
  return { items, total };
}

export async function updateMissionRun(
  id: string,
  data: Prisma.AgentMissionRunUpdateInput,
): Promise<AgentMissionRun> {
  return prisma.agentMissionRun.update({ where: { id }, data });
}

export async function markMissionRunRunning(id: string) {
  return prisma.agentMissionRun.update({
    where: { id },
    data: {
      status: 'running',
      startedAt: new Date(),
    },
  });
}

export async function completeMissionRunIfSettled(missionRunId: string): Promise<AgentMissionRun | null> {
  const run = await prisma.agentMissionRun.findUnique({ where: { id: missionRunId } });
  if (!run || run.status === 'cancelled') return run;

  const [pendingSteps, failedSteps, activeJobs] = await Promise.all([
    prisma.agentWorkflowStepRun.count({
      where: {
        missionRunId,
        status: { in: ['pending', 'running', 'retrying'] },
      },
    }),
    prisma.agentWorkflowStepRun.count({
      where: { missionRunId, status: 'failed' },
    }),
    prisma.agentJob.count({
      where: {
        missionRunId,
        status: { in: ['queued', 'claimed', 'running'] },
      },
    }),
  ]);

  if (pendingSteps > 0 || activeJobs > 0) return run;

  const status: MissionRunStatus = failedSteps > 0 ? 'completed_with_errors' : 'completed';
  const updated = await prisma.agentMissionRun.update({
    where: { id: missionRunId },
    data: {
      status,
      completedAt: new Date(),
    },
  });

  try {
    const { emitRuntimeEventAsync } = await import('../../control-plane/runtimeEventBus');
    emitRuntimeEventAsync({
      type: failedSteps > 0 ? 'MISSION_FAILED' : 'MISSION_COMPLETED',
      companyId: updated.companyId,
      entityType: 'mission_run',
      entityId: updated.id,
      payload: { status, failedSteps, missionId: updated.missionId },
    });
  } catch {
    /* ignore */
  }

  return updated;
}

export async function mergeMissionRunMetrics(
  missionRunId: string,
  delta: Record<string, number>,
) {
  const run = await prisma.agentMissionRun.findUnique({ where: { id: missionRunId } });
  if (!run) return null;
  const prev = (run.metrics && typeof run.metrics === 'object' ? run.metrics : {}) as Record<
    string,
    number
  >;
  const next = { ...prev };
  for (const [k, v] of Object.entries(delta)) {
    next[k] = (Number(next[k]) || 0) + (Number(v) || 0);
  }
  return prisma.agentMissionRun.update({
    where: { id: missionRunId },
    data: { metrics: next },
  });
}

export function buildStepIdempotencyKey(input: {
  missionRunId: string;
  scannedContentId?: string | null;
  jobId?: string | null;
  stepId: string;
  pipelineVersion: number;
}): string {
  const contentKey = input.scannedContentId || input.jobId || '_run';
  return `${input.missionRunId}:${contentKey}:${input.stepId}:v${input.pipelineVersion}`;
}

export type { AgentMissionRun, AgentWorkflowStepRun };
