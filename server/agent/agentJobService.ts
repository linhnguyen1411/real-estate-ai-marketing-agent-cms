import { prisma } from '../prisma';
import { startMissionRun } from '../modules/mission-engine/application/missionRunService';

export interface EnqueueMissionResult {
  missionId: string;
  missionRunId: string;
  jobsCreated: number;
  jobsSkipped: number;
  jobIds: string[];
}

/** Mission 2.0: create MissionRun + enqueue scan_source jobs (serialized per source). */
export async function enqueueMissionRun(input: {
  missionId: string;
  companyId: string;
  triggeredByUserId: string;
}): Promise<EnqueueMissionResult> {
  const result = await startMissionRun({
    missionId: input.missionId,
    companyId: input.companyId,
    triggerType: 'manual',
    triggeredBy: input.triggeredByUserId,
  });

  return {
    missionId: input.missionId,
    missionRunId: result.missionRunId,
    jobsCreated: result.jobsCreated,
    jobsSkipped: result.jobsSkipped,
    jobIds: result.jobIds,
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

  // Serialize: never create a second active scan_source for the same source.
  const existing = await prisma.agentJob.findFirst({
    where: {
      sourceId: source.id,
      type: 'scan_source',
      status: { in: ['queued', 'claimed', 'running'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (existing) {
    return { sourceId: source.id, jobId: existing.id };
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

  try {
    const { emitRuntimeEventAsync } = await import('../modules/control-plane/runtimeEventBus');
    emitRuntimeEventAsync({
      type: 'JOB_CREATED',
      companyId: job.companyId,
      entityType: 'job',
      entityId: job.id,
      payload: { type: job.type, sourceId: source.id },
    });
  } catch {
    /* ignore */
  }

  return { sourceId: source.id, jobId: job.id };
}
