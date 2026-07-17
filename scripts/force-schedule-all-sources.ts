/**
 * Force due + one scheduler tick (dedupe-safe) so every active source is queued.
 * Usage: npx tsx scripts/force-schedule-all-sources.ts
 */
import { prisma } from '../server/prisma';
import { runAgentSchedulerTick } from '../server/agent/agentScheduler';

async function main() {
  const now = new Date();

  // Make all active sources due so the tick covers them (scheduler still skips active dups).
  const updated = await prisma.agentSource.updateMany({
    where: { status: 'active' },
    data: { nextScanAt: new Date(now.getTime() - 1000) },
  });

  // Cancel any leftover duplicate actives first (keep earliest per source).
  const dups = await prisma.$queryRaw<Array<{ source_id: string }>>`
    SELECT source_id
    FROM agent_jobs
    WHERE type = 'scan_source'
      AND status IN ('queued','claimed','running')
      AND source_id IS NOT NULL
    GROUP BY source_id
    HAVING COUNT(*) > 1
  `;
  let cancelledDup = 0;
  for (const row of dups) {
    const jobs = await prisma.agentJob.findMany({
      where: {
        sourceId: row.source_id,
        type: 'scan_source',
        status: { in: ['queued', 'claimed', 'running'] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const extras = jobs.slice(1).map(j => j.id);
    if (extras.length === 0) continue;
    const res = await prisma.agentJob.updateMany({
      where: { id: { in: extras } },
      data: {
        status: 'cancelled',
        finishedAt: now,
        errorMessage: 'Cancelled duplicate before force schedule tick',
      },
    });
    cancelledDup += res.count;
  }

  process.env.AGENT_SCHEDULER_ENABLED = 'true';
  const tick = await runAgentSchedulerTick(now);

  const active = await prisma.agentJob.findMany({
    where: {
      type: 'scan_source',
      status: { in: ['queued', 'claimed', 'running'] },
    },
    select: {
      id: true,
      sourceId: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const bySource = new Map<string, number>();
  for (const j of active) {
    if (!j.sourceId) continue;
    bySource.set(j.sourceId, (bySource.get(j.sourceId) || 0) + 1);
  }
  const remainingDups = [...bySource.entries()].filter(([, n]) => n > 1);

  const sources = await prisma.agentSource.findMany({
    where: { status: 'active' },
    select: { id: true, name: true, nextScanAt: true },
    orderBy: { name: 'asc' },
  });

  console.log(
    JSON.stringify(
      {
        markedDue: updated.count,
        cancelledDup,
        tick,
        activeScanJobs: active.length,
        uniqueSourcesQueued: bySource.size,
        remainingDuplicateGroups: remainingDups.length,
        sources: sources.map(s => ({
          name: s.name,
          nextScanAt: s.nextScanAt,
          activeJobs: bySource.get(s.id) || 0,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
