/**
 * VPS-side MissionRun + StepRun upsert from local provenance envelope.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import type { MissionWorkflowProvenance } from '../agentSync/missionProvenance';
import { assertValidPipeline } from '../modules/mission-engine/domain/workflowValidation';
import { buildStepIdempotencyKey } from '../modules/mission-engine/repositories/missionRunRepository';

export type MissionProvenanceStepRef = {
  stepId: string;
  stepType: string;
  status: 'completed' | 'skipped' | 'failed';
  executionTarget?: string | null;
  output?: Record<string, unknown> | null;
  findingId?: string | null;
  externalInventoryId?: string | null;
  completedAt?: string | null;
};

export async function ensureMissionRunFromProvenance(
  provenance: MissionWorkflowProvenance,
  companyId: string | null,
): Promise<{ missionRunId: string; created: boolean }> {
  const localRunId = provenance.missionRunId!;
  const existing = await prisma.agentMissionRun.findUnique({ where: { id: localRunId } });
  if (existing) {
    return { missionRunId: existing.id, created: false };
  }

  if (!provenance.missionId) {
    throw new Error('mission_provenance_missing_mission_id');
  }

  const mission = await prisma.agentMission.findUnique({ where: { id: provenance.missionId } });
  if (!mission) {
    throw new Error('mission_provenance_missing_mission');
  }
  if (companyId && mission.companyId && mission.companyId !== companyId) {
    throw new Error('mission_provenance_tenant_mismatch');
  }

  let pipelineSnapshot = provenance.pipelineSnapshot;
  if (!pipelineSnapshot) {
    pipelineSnapshot = mission.pipeline ?? null;
  }
  if (!pipelineSnapshot) {
    throw new Error('mission_provenance_missing_pipeline_snapshot');
  }

  const pipeline = assertValidPipeline(pipelineSnapshot);
  if (
    provenance.pipelineVersion != null &&
    pipeline.version !== provenance.pipelineVersion
  ) {
    throw new Error('mission_provenance_unknown_pipeline_version');
  }

  await prisma.agentMissionRun.create({
    data: {
      id: localRunId,
      companyId: mission.companyId ?? companyId,
      missionId: mission.id,
      missionVersion: provenance.missionVersion ?? provenance.pipelineVersion ?? pipeline.version,
      pipelineSnapshot: pipeline as unknown as Prisma.InputJsonValue,
      pipelineHash: provenance.pipelineHash,
      status: 'running',
      triggerType: 'sync',
      triggeredBy: provenance.workerId ?? 'local_sync',
      startedAt: new Date(),
      metrics: {},
    },
  });

  return { missionRunId: localRunId, created: true };
}

export async function syncCompletedLocalSteps(input: {
  provenance: MissionWorkflowProvenance;
  companyId: string | null;
  missionRunId: string;
  missionId: string;
  scannedContentId: string;
  sourceId: string | null;
  jobId: string | null;
  pipelineVersion: number;
}): Promise<number> {
  let synced = 0;
  for (const step of input.provenance.completedLocalSteps) {
    if (step.status !== 'completed' && step.status !== 'skipped') continue;
    const idempotencyKey = buildStepIdempotencyKey({
      missionRunId: input.missionRunId,
      scannedContentId: input.scannedContentId,
      jobId: input.jobId,
      stepId: step.stepId,
      pipelineVersion: input.pipelineVersion,
    });

    const existing = await prisma.agentWorkflowStepRun.findUnique({
      where: { idempotencyKey },
    });
    if (existing?.status === 'completed' || existing?.status === 'skipped') {
      continue;
    }

    await prisma.agentWorkflowStepRun.upsert({
      where: { idempotencyKey },
      create: {
        idempotencyKey,
        companyId: input.companyId,
        missionRunId: input.missionRunId,
        missionId: input.missionId,
        jobId: input.jobId,
        sourceId: input.sourceId,
        scannedContentId: input.scannedContentId,
        stepId: step.stepId,
        stepType: step.stepType,
        status: step.status,
        output: {
          ...(step.output ?? {}),
          ...(step.externalInventoryId ? { itemId: step.externalInventoryId } : {}),
        } as Prisma.InputJsonValue,
        findingId: step.findingId,
        completedAt: step.completedAt ? new Date(step.completedAt) : new Date(),
        startedAt: step.completedAt ? new Date(step.completedAt) : new Date(),
        attempts: 1,
        maxAttempts: 1,
      },
      update: {
        status: step.status,
        output: {
          ...(step.output ?? {}),
          ...(step.externalInventoryId ? { itemId: step.externalInventoryId } : {}),
        } as Prisma.InputJsonValue,
        findingId: step.findingId,
        completedAt: step.completedAt ? new Date(step.completedAt) : new Date(),
      },
    });
    synced += 1;
  }
  return synced;
}

export function completedLocalStepsFromDb(
  steps: Array<{
    stepId: string;
    stepType: string;
    status: string;
    output: unknown;
    findingId: string | null;
    externalInventoryId: string | null;
    completedAt: Date | null;
  }>,
): MissionProvenanceStepRef[] {
  return steps
    .filter(s => s.status === 'completed' || s.status === 'skipped')
    .map(s => ({
      stepId: s.stepId,
      stepType: s.stepType,
      status: s.status as MissionProvenanceStepRef['status'],
      executionTarget: 'local_worker',
      output: (s.output && typeof s.output === 'object'
        ? s.output
        : {}) as Record<string, unknown>,
      findingId: s.findingId,
      externalInventoryId: s.externalInventoryId,
      completedAt: s.completedAt?.toISOString() ?? null,
    }));
}
