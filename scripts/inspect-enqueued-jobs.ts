import { prisma } from '../server/prisma';

async function main() {
  const since = new Date(Date.now() - 30 * 60_000);
  const recentJobs = await prisma.agentJob.findMany({
    where: { type: 'scan_source', updatedAt: { gte: since } },
    orderBy: { updatedAt: 'desc' },
    take: 12,
    select: {
      id: true,
      status: true,
      sourceId: true,
      missionId: true,
      missionRunId: true,
      claimedBy: true,
      startedAt: true,
      finishedAt: true,
      errorMessage: true,
    },
  });

  const lifecycle = {
    queued: recentJobs.filter(j => j.status === 'queued').length,
    claimed: recentJobs.filter(j => j.status === 'claimed').length,
    running: recentJobs.filter(j => j.status === 'running').length,
    completed: recentJobs.filter(j => j.status === 'completed').length,
    failed: recentJobs.filter(j => j.status === 'failed').length,
  };

  const outboxPending = await prisma.agentSyncOutbox.count({
    where: { status: { in: ['pending', 'processing', 'failed', 'dead_letter'] } },
  });

  console.log(
    JSON.stringify(
      {
        windowMinutes: 30,
        lifecycle,
        recentJobs,
        outboxPendingOrFailed: outboxPending,
        duplicateActivePerSource: await prisma.$queryRaw<
          { source_id: string; cnt: bigint }[]
        >`
          SELECT source_id, COUNT(*)::bigint as cnt
          FROM agent_jobs
          WHERE type = 'scan_source'
            AND status IN ('queued','claimed','running')
            AND source_id IS NOT NULL
          GROUP BY source_id
          HAVING COUNT(*) > 1
        `,
      },
      null,
      2,
    ),
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
