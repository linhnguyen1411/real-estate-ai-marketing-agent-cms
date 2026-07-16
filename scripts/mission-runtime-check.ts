import { recoverOrphanAgentJobs } from '../server/agent/orphanAgentJobRecovery';
import { prisma } from '../server/prisma';

async function main() {
  const jobByStatus = await prisma.agentJob.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const activeJobs = await prisma.agentJob.findMany({
    where: { status: { in: ['queued', 'claimed', 'running'] } },
    orderBy: { updatedAt: 'desc' },
    take: 15,
    select: {
      id: true,
      status: true,
      type: true,
      sourceId: true,
      missionId: true,
      missionRunId: true,
      claimedBy: true,
      startedAt: true,
      updatedAt: true,
      availableAt: true,
    },
  });
  const staleCutoff = new Date(Date.now() - 30 * 60_000);
  const staleJobs = await prisma.agentJob.count({
    where: {
      status: { in: ['claimed', 'running'] },
      OR: [{ startedAt: { lt: staleCutoff } }, { startedAt: null, claimedAt: { lt: staleCutoff } }],
    },
  });
  const sessions = await prisma.browserSession.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  const outbox = await prisma.agentSyncOutbox.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const runs = await prisma.agentMissionRun.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const stepByStatus = await prisma.agentWorkflowStepRun.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const missionSourceCount = await prisma.agentMissionSource.count();
  const missionRunCount = await prisma.agentMissionRun.count();
  const stepRunCount = await prisma.agentWorkflowStepRun.count();
  const orphan = await recoverOrphanAgentJobs({ dryRun: true });
  const outboxPending = await prisma.agentSyncOutbox.count({
    where: { status: { in: ['pending', 'processing', 'failed', 'dead_letter'] } },
  });
  const duplicateActiveScan = await prisma.$queryRaw<
    { source_id: string; cnt: bigint }[]
  >`
    SELECT source_id, COUNT(*)::bigint as cnt
    FROM agent_jobs
    WHERE type = 'scan_source'
      AND status IN ('queued','claimed','running')
      AND source_id IS NOT NULL
    GROUP BY source_id
    HAVING COUNT(*) > 1
  `;

  console.log(
    JSON.stringify(
      {
        jobByStatus,
        activeJobs,
        staleJobs,
        orphanJobs: orphan.orphaned.length,
        liveWorkers: orphan.liveWorkers,
        outboxPendingOrFailed: outboxPending,
        duplicateActiveScanPerSource: duplicateActiveScan,
        sessions: sessions.map(s => ({
          id: s.id,
          status: s.status,
          workerId: s.workerId,
          lastHeartbeatAt: s.lastHeartbeatAt,
          currentUrl: s.currentUrl,
          updatedAt: s.updatedAt,
        })),
        outbox,
        missionRunByStatus: runs,
        stepByStatus,
        counts: { missionSourceCount, missionRunCount, stepRunCount },
      },
      null,
      2,
    ),
  );
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
