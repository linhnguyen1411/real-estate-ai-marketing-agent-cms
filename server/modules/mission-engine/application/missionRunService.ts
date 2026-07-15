import { prisma } from '../../../prisma';
import { resolveMissionSourceIds } from '../../../agent/agentDb';
import { assertValidPipeline } from '../domain/workflowValidation';
import { resolveMissionPipeline } from '../domain/missionTemplates';
import { pipelineSnapshotHash } from '../domain/workflowPolicies';
import type { TriggerType } from '../domain/workflowTypes';
import { createMissionRun } from '../repositories/missionRunRepository';

export interface StartMissionRunInput {
  missionId: string;
  companyId: string;
  triggerType?: TriggerType;
  triggeredBy?: string | null;
}

export interface StartMissionRunResult {
  missionRunId: string;
  jobsCreated: number;
  jobsSkipped: number;
  jobIds: string[];
}

async function resolveActiveMissionSourceIds(
  missionId: string,
  companyId: string,
  mission: { companyId: string | null; rules: unknown },
): Promise<string[]> {
  const links = await prisma.agentMissionSource.findMany({
    where: { missionId, isActive: true },
    select: { sourceId: true },
    orderBy: { createdAt: 'asc' },
  });
  if (links.length > 0) {
    return links.map(l => l.sourceId);
  }
  return resolveMissionSourceIds(mission, companyId);
}

export async function startMissionRun(input: StartMissionRunInput): Promise<StartMissionRunResult> {
  const mission = await prisma.agentMission.findUnique({ where: { id: input.missionId } });
  if (!mission) {
    throw new Error('Không tìm thấy mission.');
  }
  if (mission.status === 'completed') {
    throw new Error('Mission đã hoàn thành, không thể chạy lại.');
  }

  const pipeline = assertValidPipeline(resolveMissionPipeline(mission));
  const pipelineHash = pipelineSnapshotHash(pipeline);
  const now = new Date();

  const run = await createMissionRun({
    companyId: mission.companyId ?? input.companyId,
    missionId: mission.id,
    missionVersion: (mission as { pipelineVersion?: number }).pipelineVersion ?? pipeline.version,
    pipelineSnapshot: pipeline,
    pipelineHash,
    triggerType: input.triggerType ?? 'manual',
    triggeredBy: input.triggeredBy ?? null,
    status: 'queued',
  });

  const sourceIds = await resolveActiveMissionSourceIds(mission.id, input.companyId, mission);
  if (sourceIds.length === 0) {
    throw new Error('Không có nguồn active phù hợp để enqueue job.');
  }

  const jobIds: string[] = [];
  let jobsSkipped = 0;

  await prisma.$transaction(async tx => {
    for (const sourceId of sourceIds) {
      const source = await tx.agentSource.findUnique({ where: { id: sourceId } });
      if (!source || source.status !== 'active') continue;

      const activeJob = await tx.agentJob.findFirst({
        where: {
          sourceId: source.id,
          type: 'scan_source',
          status: { in: ['queued', 'claimed', 'running'] },
        },
        select: { id: true },
      });
      if (activeJob) {
        jobsSkipped += 1;
        continue;
      }

      const job = await tx.agentJob.create({
        data: {
          companyId: mission.companyId ?? input.companyId,
          missionId: mission.id,
          missionRunId: run.id,
          sourceId: source.id,
          type: 'scan_source',
          status: 'queued',
          priority: source.priority,
          availableAt: now,
          payload: {
            missionId: mission.id,
            missionRunId: run.id,
            sourceId: source.id,
            pipelineVersion: pipeline.version,
            pipelineHash,
            triggeredBy: input.triggeredBy ?? null,
            enqueuedAt: now.toISOString(),
          },
        },
      });
      jobIds.push(job.id);
    }

    if (jobIds.length === 0 && jobsSkipped === 0) {
      throw new Error('Không tạo được job nào từ các nguồn đã chọn.');
    }

    await tx.agentMission.update({
      where: { id: mission.id },
      data: {
        status: mission.status === 'draft' ? 'active' : mission.status,
        lastRunAt: now,
      },
    });
  });

  return {
    missionRunId: run.id,
    jobsCreated: jobIds.length,
    jobsSkipped,
    jobIds,
  };
}

function computeNextRunAt(schedule: unknown, from: Date): Date | null {
  if (!schedule || typeof schedule !== 'object') return null;
  const cadence = String((schedule as { cadence?: string }).cadence || '').toLowerCase();
  const ms =
    cadence === 'hourly'
      ? 60 * 60_000
      : cadence === 'every_2h'
        ? 2 * 60 * 60_000
        : cadence === 'every_4h'
          ? 4 * 60 * 60_000
          : cadence === 'daily'
            ? 24 * 60 * 60_000
            : null;
  if (!ms) return null;
  return new Date(from.getTime() + ms);
}

/** Scheduler: enqueue MissionRuns for active missions past nextRunAt. */
export async function enqueueDueScheduledMissions(now = new Date()): Promise<{
  missionsDue: number;
  runsCreated: number;
}> {
  const due = await prisma.agentMission.findMany({
    where: {
      status: 'active',
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    take: 20,
    orderBy: { nextRunAt: 'asc' },
  });

  let runsCreated = 0;
  let missionsDue = 0;

  for (const mission of due) {
    const cadence = String((mission.schedule as { cadence?: string } | null)?.cadence || '');
    if (!cadence || cadence === 'manual') continue;
    missionsDue += 1;

    // Avoid duplicate open runs for the same mission
    const open = await prisma.agentMissionRun.findFirst({
      where: {
        missionId: mission.id,
        status: { in: ['queued', 'running'] },
      },
      select: { id: true },
    });
    if (open) continue;

    try {
      await startMissionRun({
        missionId: mission.id,
        companyId: mission.companyId || 'comp-da-nang',
        triggerType: 'schedule',
        triggeredBy: 'scheduler',
      });
      const nextRunAt = computeNextRunAt(mission.schedule, now);
      await prisma.agentMission.update({
        where: { id: mission.id },
        data: { nextRunAt: nextRunAt ?? new Date(now.getTime() + 4 * 60 * 60_000) },
      });
      runsCreated += 1;
    } catch {
      // skip failing mission; next tick retries
    }
  }

  return { missionsDue, runsCreated };
}
