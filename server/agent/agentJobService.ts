import { prisma } from '../prisma';
import { getAgentMissionById, resolveMissionSourceIds } from './agentDb';

export interface EnqueueMissionResult {
  missionId: string;
  jobsCreated: number;
  jobIds: string[];
}

export async function enqueueMissionRun(input: {
  missionId: string;
  companyId: string;
  triggeredByUserId: string;
}): Promise<EnqueueMissionResult> {
  const mission = await getAgentMissionById(input.missionId);
  if (!mission) {
    throw new Error('Không tìm thấy mission.');
  }

  if (mission.status === 'completed') {
    throw new Error('Mission đã hoàn thành, không thể chạy lại.');
  }

  const sourceIds = await resolveMissionSourceIds(mission, input.companyId);
  if (sourceIds.length === 0) {
    throw new Error('Không có nguồn active phù hợp để enqueue job.');
  }

  const now = new Date();
  const jobIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const sourceId of sourceIds) {
      const source = await tx.agentSource.findUnique({ where: { id: sourceId } });
      if (!source || source.status !== 'active') continue;

      const job = await tx.agentJob.create({
        data: {
          companyId: mission.companyId ?? input.companyId,
          missionId: mission.id,
          sourceId: source.id,
          type: 'scan_source',
          status: 'queued',
          priority: source.priority,
          availableAt: now,
          payload: {
            missionId: mission.id,
            sourceId: source.id,
            triggeredBy: input.triggeredByUserId,
            enqueuedAt: now.toISOString(),
          },
        },
      });
      jobIds.push(job.id);
    }

    if (jobIds.length === 0) {
      throw new Error('Không tạo được job nào từ các nguồn đã chọn.');
    }

    await tx.agentMission.update({
      where: { id: mission.id },
      data: {
        status: mission.status === 'draft' ? 'active' : mission.status,
      },
    });
  });

  return {
    missionId: mission.id,
    jobsCreated: jobIds.length,
    jobIds,
  };
}

export interface EnqueueSourceResult {
  sourceId: string;
  jobId: string;
}

export async function enqueueSourceScan(input: {
  sourceId: string;
  companyId: string;
  triggeredByUserId: string;
  missionId?: string | null;
}): Promise<EnqueueSourceResult> {
  const source = await prisma.agentSource.findUnique({ where: { id: input.sourceId } });
  if (!source) {
    throw new Error('Không tìm thấy nguồn.');
  }
  if (source.status !== 'active') {
    throw new Error('Nguồn không active, không thể quét.');
  }

  const now = new Date();
  const job = await prisma.agentJob.create({
    data: {
      companyId: source.companyId ?? input.companyId,
      missionId: input.missionId ?? null,
      sourceId: source.id,
      type: 'scan_source',
      status: 'queued',
      priority: source.priority,
      availableAt: now,
      payload: {
        sourceId: source.id,
        missionId: input.missionId ?? null,
        triggeredBy: input.triggeredByUserId,
        enqueuedAt: now.toISOString(),
      },
    },
  });

  return { sourceId: source.id, jobId: job.id };
}
