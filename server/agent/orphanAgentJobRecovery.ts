/**
 * Fail jobs claimed by workers with no recent ready BrowserSession (post-restart orphans).
 */
import { prisma } from '../prisma';

const DEFAULT_STALE_HEARTBEAT_MS = 3 * 60_000;

export interface RecoverOrphanAgentJobsResult {
  dryRun: boolean;
  liveWorkers: string[];
  orphaned: Array<{
    id: string;
    status: string;
    type: string;
    sourceId: string | null;
    claimedBy: string | null;
    missionRunId: string | null;
  }>;
  recovered: number;
}

export async function recoverOrphanAgentJobs(input?: {
  dryRun?: boolean;
  staleHeartbeatMs?: number;
}): Promise<RecoverOrphanAgentJobsResult> {
  const dryRun = input?.dryRun !== false;
  const staleHeartbeatMs = input?.staleHeartbeatMs ?? DEFAULT_STALE_HEARTBEAT_MS;
  const now = Date.now();

  const readySessions = await prisma.browserSession.findMany({
    where: {
      status: { in: ['ready', 'running'] },
      lastHeartbeatAt: { gte: new Date(now - staleHeartbeatMs) },
    },
    select: { workerId: true },
  });
  const liveWorkers = [
    ...new Set(readySessions.map(s => s.workerId).filter(Boolean) as string[]),
  ];

  const activeJobs = await prisma.agentJob.findMany({
    where: { status: { in: ['claimed', 'running'] } },
    select: {
      id: true,
      status: true,
      type: true,
      sourceId: true,
      claimedBy: true,
      missionRunId: true,
    },
  });

  const orphaned = activeJobs.filter(
    j => j.claimedBy && !liveWorkers.includes(j.claimedBy),
  );

  let recovered = 0;
  if (!dryRun && orphaned.length > 0) {
    const result = await prisma.agentJob.updateMany({
      where: { id: { in: orphaned.map(j => j.id) } },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: 'Orphaned job — claiming worker no longer active',
      },
    });
    recovered = result.count;
  }

  return { dryRun, liveWorkers, orphaned, recovered };
}
