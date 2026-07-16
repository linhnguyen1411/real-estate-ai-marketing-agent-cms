import { prisma } from '../../../prisma';
import type { WorkflowPipelineDefinition } from '../domain/workflowTypes';

export interface MissionRunStepItem {
  id: string;
  stepId: string;
  stepType: string;
  status: string;
  executionTarget: string | null;
  sourceId: string | null;
  scannedContentId: string | null;
  findingId: string | null;
  externalInventoryId: string | null;
  attempts: number;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  warnings: string[];
  errorCode: string | null;
  errorMessage: string | null;
}

export interface MissionRunDetailResponse {
  id: string;
  missionId: string;
  missionName: string;
  status: string;
  triggerType: string;
  triggeredBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  pipelineVersion: number;
  pipelineHash: string | null;
  sources: Array<{ id: string; name: string; url: string }>;
  jobs: Array<{
    id: string;
    sourceId: string | null;
    status: string;
    type: string;
    errorMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
  metrics: Record<string, number>;
  stepSummary: {
    total: number;
    completed: number;
    skipped: number;
    failed: number;
    pending: number;
    running: number;
  };
  errors: Array<{ stepId: string; stepType: string; errorCode: string | null; errorMessage: string | null }>;
  steps: MissionRunStepItem[];
}

function executionTargetForStep(
  pipeline: WorkflowPipelineDefinition | null,
  stepId: string,
): string | null {
  if (!pipeline) return null;
  const step = pipeline.steps.find(s => s.id === stepId);
  return step?.executionTarget ?? 'either';
}

export async function buildMissionRunDetail(runId: string): Promise<MissionRunDetailResponse | null> {
  const run = await prisma.agentMissionRun.findUnique({
    where: { id: runId },
    include: {
      mission: { select: { id: true, name: true, pipeline: true } },
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
  if (!run) return null;

  const steps = await prisma.agentWorkflowStepRun.findMany({
    where: { missionRunId: run.id },
    orderBy: [{ scannedContentId: 'asc' }, { createdAt: 'asc' }],
  });

  const sourceIds = [
    ...new Set([
      ...run.jobs.map(j => j.sourceId).filter(Boolean) as string[],
      ...steps.map(s => s.sourceId).filter(Boolean) as string[],
    ]),
  ];
  const sources = sourceIds.length
    ? await prisma.agentSource.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, name: true, url: true },
      })
    : [];

  const pipeline =
    run.pipelineSnapshot && typeof run.pipelineSnapshot === 'object'
      ? (run.pipelineSnapshot as unknown as WorkflowPipelineDefinition)
      : run.mission.pipeline && typeof run.mission.pipeline === 'object'
        ? (run.mission.pipeline as unknown as WorkflowPipelineDefinition)
        : null;

  const stepSummary = {
    total: steps.length,
    completed: steps.filter(s => s.status === 'completed').length,
    skipped: steps.filter(s => s.status === 'skipped').length,
    failed: steps.filter(s => s.status === 'failed').length,
    pending: steps.filter(s => s.status === 'pending').length,
    running: steps.filter(s => s.status === 'running' || s.status === 'retrying').length,
  };

  const metrics = (run.metrics && typeof run.metrics === 'object'
    ? run.metrics
    : {}) as Record<string, number>;

  const startedAt = run.startedAt ?? run.createdAt;
  const completedAt = run.completedAt;
  const durationMs =
    startedAt && completedAt
      ? completedAt.getTime() - startedAt.getTime()
      : startedAt
        ? Date.now() - startedAt.getTime()
        : null;

  const stepItems: MissionRunStepItem[] = steps.map(s => {
    const output =
      s.output && typeof s.output === 'object' ? (s.output as Record<string, unknown>) : {};
    const warnings = Array.isArray(output.warnings)
      ? output.warnings.map(String)
      : output.reason
        ? [String(output.reason)]
        : [];
    return {
      id: s.id,
      stepId: s.stepId,
      stepType: s.stepType,
      status: s.status,
      executionTarget: executionTargetForStep(pipeline, s.stepId),
      sourceId: s.sourceId,
      scannedContentId: s.scannedContentId,
      findingId: s.findingId,
      externalInventoryId:
        s.output && typeof s.output === 'object' && (s.output as { itemId?: string }).itemId
          ? String((s.output as { itemId?: string }).itemId)
          : null,
      attempts: s.attempts,
      durationMs: s.durationMs,
      startedAt: s.startedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      warnings,
      errorCode: s.errorCode,
      errorMessage: s.errorMessage,
    };
  });

  const errors = stepItems
    .filter(s => s.status === 'failed')
    .map(s => ({
      stepId: s.stepId,
      stepType: s.stepType,
      errorCode: s.errorCode,
      errorMessage: s.errorMessage,
    }));

  return {
    id: run.id,
    missionId: run.missionId,
    missionName: run.mission.name,
    status: run.status,
    triggerType: run.triggerType,
    triggeredBy: run.triggeredBy,
    startedAt: startedAt?.toISOString() ?? null,
    completedAt: completedAt?.toISOString() ?? null,
    durationMs,
    pipelineVersion: run.missionVersion,
    pipelineHash: run.pipelineHash,
    sources,
    jobs: run.jobs.map(j => ({
      id: j.id,
      sourceId: j.sourceId,
      status: j.status,
      type: j.type,
      errorMessage: j.errorMessage,
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
    })),
    metrics,
    stepSummary,
    errors,
    steps: stepItems,
  };
}

export async function enrichMissionListItem(missionId: string) {
  const mission = await prisma.agentMission.findUnique({
    where: { id: missionId },
    select: { nextRunAt: true, lastRunAt: true, schedule: true, status: true, pipeline: true },
  });
  const lastRun = await prisma.agentMissionRun.findFirst({
    where: { missionId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, createdAt: true },
  });
  const openRuns = await prisma.agentMissionRun.count({
    where: { missionId, status: { in: ['queued', 'running'] } },
  });
  const sourceCount = await prisma.agentMissionSource.count({
    where: { missionId, isActive: true },
  });

  const pipelineDef =
    mission?.pipeline && typeof mission.pipeline === 'object'
      ? (mission.pipeline as unknown as WorkflowPipelineDefinition)
      : null;

  return {
    lastRunStatus: lastRun?.status ?? null,
    lastRunAt: mission?.lastRunAt?.toISOString() ?? lastRun?.createdAt?.toISOString() ?? null,
    nextRunAt: mission?.nextRunAt?.toISOString() ?? null,
    schedule: mission?.schedule ?? null,
    runningCount: openRuns,
    sourceCount,
    pipelineStepCount: pipelineDef?.steps?.filter(s => s.enabled !== false).length ?? 0,
    schedulerSkipReason:
      mission?.status === 'paused'
        ? 'mission_paused'
        : mission?.status !== 'active'
          ? 'mission_not_active'
          : null,
  };
}
