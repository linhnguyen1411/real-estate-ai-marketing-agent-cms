/**
 * Fail stale agent jobs left by previous worker PIDs (safe ops recovery).
 * Also reports orphan jobs (dead worker, recent claim). Dry-run by default; --apply to mutate.
 */
import { recoverOrphanAgentJobs } from '../server/agent/orphanAgentJobRecovery';
import { prisma } from '../server/prisma';

async function main() {
  const apply = process.argv.includes('--apply');
  const orphan = await recoverOrphanAgentJobs({ dryRun: !apply });
  const staleCutoff = new Date(Date.now() - 20 * 60_000);
  const stale = await prisma.agentJob.findMany({
    where: {
      status: { in: ['claimed', 'running'] },
      OR: [
        { startedAt: { lt: staleCutoff } },
        { AND: [{ startedAt: null }, { claimedAt: { lt: staleCutoff } }] },
      ],
    },
    select: {
      id: true,
      status: true,
      sourceId: true,
      claimedBy: true,
      startedAt: true,
      claimedAt: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        orphan,
        staleCount: stale.length,
        stale,
      },
      null,
      2,
    ),
  );
  if (!apply || stale.length === 0) return;

  const result = await prisma.agentJob.updateMany({
    where: { id: { in: stale.map(j => j.id) } },
    data: {
      status: 'failed',
      finishedAt: new Date(),
      errorMessage: 'Stale job recovered after worker restart (Prisma regen kill)',
    },
  });
  console.log(JSON.stringify({ updated: result.count }));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
