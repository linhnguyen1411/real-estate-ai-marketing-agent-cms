/**
 * Print source scan schedule coverage + recent duplicate waste.
 * Usage: npx tsx scripts/report-source-scan-coverage.ts
 */
import { prisma } from '../server/prisma';

const ACTIVE = ['queued', 'claimed', 'running'] as const;

async function main() {
  const now = new Date();
  const sources = await prisma.agentSource.findMany({
    where: { status: 'active' },
    orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      type: true,
      priority: true,
      nextScanAt: true,
      lastScannedAt: true,
      scanIntervalMinutes: true,
    },
  });

  const activeJobs = await prisma.agentJob.findMany({
    where: {
      type: 'scan_source',
      status: { in: [...ACTIVE] },
      sourceId: { not: null },
    },
    select: { id: true, sourceId: true, status: true, createdAt: true, startedAt: true },
  });
  const activeBySource = new Map(activeJobs.map(j => [j.sourceId!, j]));

  const since = new Date(Date.now() - 6 * 60 * 60_000);
  const recent = await prisma.agentJob.findMany({
    where: {
      type: 'scan_source',
      createdAt: { gte: since },
      sourceId: { not: null },
    },
    select: { id: true, sourceId: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const recentBySource = new Map<string, typeof recent>();
  for (const j of recent) {
    const list = recentBySource.get(j.sourceId!) || [];
    list.push(j);
    recentBySource.set(j.sourceId!, list);
  }

  const rows = sources.map(s => {
    const active = activeBySource.get(s.id);
    const recentCount = recentBySource.get(s.id)?.length || 0;
    const due =
      !s.nextScanAt || s.nextScanAt.getTime() <= now.getTime() ? 'DUE' : 'scheduled';
    return {
      name: s.name,
      type: s.type,
      priority: s.priority,
      intervalMin: s.scanIntervalMinutes,
      lastScanAt: s.lastScannedAt?.toISOString() ?? null,
      nextScanAt: s.nextScanAt?.toISOString() ?? null,
      schedule: due,
      activeJob: active
        ? { id: active.id, status: active.status }
        : null,
      jobsLast6h: recentCount,
    };
  });

  // Sources with >1 job created in last 15m while overlapping active = potential waste
  const wasteCandidates = [...recentBySource.entries()]
    .map(([sourceId, jobs]) => {
      const window = jobs.filter(
        j => j.createdAt.getTime() >= Date.now() - 15 * 60_000,
      );
      return { sourceId, count15m: window.length, statuses: window.map(j => j.status) };
    })
    .filter(x => x.count15m > 1);

  const cancelledDupRecent = await prisma.agentJob.count({
    where: {
      type: 'scan_source',
      status: 'cancelled',
      createdAt: { gte: since },
      errorMessage: { contains: 'duplicate' },
    },
  });

  console.log(
    JSON.stringify(
      {
        now: now.toISOString(),
        activeSources: sources.length,
        withActiveJob: rows.filter(r => r.activeJob).length,
        dueNow: rows.filter(r => r.schedule === 'DUE').length,
        scheduledFuture: rows.filter(r => r.schedule === 'scheduled').length,
        missingNextScanAt: rows.filter(r => !r.nextScanAt).length,
        wasteCandidatesLast15m: wasteCandidates,
        cancelledDuplicateMsgLast6h: cancelledDupRecent,
        sources: rows,
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
