/**
 * Ops: dedupe active scan jobs + ensure every active source is scheduled/enqueued.
 *
 * - Cancel duplicate active scan_source jobs (keep earliest created)
 * - Cancel duplicate active publish_social per publishJobId if any
 * - For active sources due (nextScanAt null/past) without active scan job → enqueue once
 * - Ensure nextScanAt is set after enqueue
 *
 * Usage: npx tsx scripts/ensure-source-scans-enqueued.ts
 */
import { prisma } from '../server/prisma';
import { computeNextScanAt } from '../server/agent/agentScheduler';
import { enqueueSourceScan } from '../server/agent/agentJobService';

const TRIGGERED_BY = 'ops-ensure-source-scans';
const ACTIVE = ['queued', 'claimed', 'running'] as const;

async function dedupeActiveScanJobs() {
  const dups = await prisma.$queryRaw<Array<{ source_id: string; cnt: bigint }>>`
    SELECT source_id, COUNT(*)::bigint as cnt
    FROM agent_jobs
    WHERE type = 'scan_source'
      AND status IN ('queued','claimed','running')
      AND source_id IS NOT NULL
    GROUP BY source_id
    HAVING COUNT(*) > 1
  `;

  let cancelled = 0;
  const details: Array<{ sourceId: string; kept: string; cancelled: string[] }> = [];

  for (const row of dups) {
    const sourceId = row.source_id;
    const jobs = await prisma.agentJob.findMany({
      where: {
        sourceId,
        type: 'scan_source',
        status: { in: [...ACTIVE] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (jobs.length <= 1) continue;
    const [keep, ...extras] = jobs;
    const extraIds = extras.map(j => j.id);
    const res = await prisma.agentJob.updateMany({
      where: { id: { in: extraIds } },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        errorMessage: 'Cancelled duplicate active scan_source (ops-ensure-source-scans)',
      },
    });
    cancelled += res.count;
    details.push({ sourceId, kept: keep.id, cancelled: extraIds });
  }

  return { duplicateGroups: dups.length, cancelled, details };
}

async function dedupeActivePublishJobs() {
  // Multiple active AgentJobs for same publishJobId waste workers
  const jobs = await prisma.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: [...ACTIVE] },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, payload: true, createdAt: true },
  });

  const byPublishJob = new Map<string, string[]>();
  for (const job of jobs) {
    const payload = (job.payload || {}) as Record<string, unknown>;
    const publishJobId =
      typeof payload.publishJobId === 'string'
        ? payload.publishJobId
        : typeof payload.socialPublishJobId === 'string'
          ? payload.socialPublishJobId
          : null;
    if (!publishJobId) continue;
    const list = byPublishJob.get(publishJobId) || [];
    list.push(job.id);
    byPublishJob.set(publishJobId, list);
  }

  let cancelled = 0;
  const details: Array<{ publishJobId: string; kept: string; cancelled: string[] }> = [];
  for (const [publishJobId, ids] of byPublishJob) {
    if (ids.length <= 1) continue;
    const [keep, ...extras] = ids;
    const res = await prisma.agentJob.updateMany({
      where: { id: { in: extras } },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        errorMessage: 'Cancelled duplicate active publish_social (ops-ensure-source-scans)',
      },
    });
    cancelled += res.count;
    details.push({ publishJobId, kept: keep, cancelled: extras });
  }

  return { duplicateGroups: details.length, cancelled, details };
}

async function enqueueMissingDueSources() {
  const now = new Date();
  const sources = await prisma.agentSource.findMany({
    where: {
      status: 'active',
      OR: [{ nextScanAt: null }, { nextScanAt: { lte: now } }],
    },
    orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      type: true,
      companyId: true,
      priority: true,
      nextScanAt: true,
      scanIntervalMinutes: true,
    },
  });

  const results: Array<Record<string, unknown>> = [];
  let enqueued = 0;
  let skipped = 0;

  for (const source of sources) {
    const active = await prisma.agentJob.findFirst({
      where: {
        sourceId: source.id,
        type: 'scan_source',
        status: { in: [...ACTIVE] },
      },
      select: { id: true },
    });

    if (active) {
      // Still due but already has a job — bump nextScanAt so scheduler doesn't thrash
      if (!source.nextScanAt || source.nextScanAt.getTime() <= now.getTime()) {
        await prisma.agentSource.update({
          where: { id: source.id },
          data: { nextScanAt: computeNextScanAt(now, source.scanIntervalMinutes) },
        });
      }
      skipped += 1;
      results.push({
        name: source.name,
        skipped: true,
        reason: 'active_job',
        jobId: active.id,
      });
      continue;
    }

    const r = await enqueueSourceScan({
      sourceId: source.id,
      companyId: source.companyId || 'comp-da-nang',
      triggeredByUserId: TRIGGERED_BY,
    });
    await prisma.agentSource.update({
      where: { id: source.id },
      data: { nextScanAt: computeNextScanAt(now, source.scanIntervalMinutes) },
    });
    enqueued += 1;
    results.push({
      name: source.name,
      type: source.type,
      jobId: r.jobId,
      nextScanAt: computeNextScanAt(now, source.scanIntervalMinutes).toISOString(),
    });
  }

  return { dueSources: sources.length, enqueued, skipped, results };
}

async function summary() {
  const now = new Date();
  const activeSources = await prisma.agentSource.count({ where: { status: 'active' } });
  const missingNext = await prisma.agentSource.count({
    where: { status: 'active', nextScanAt: null },
  });
  const due = await prisma.agentSource.count({
    where: {
      status: 'active',
      OR: [{ nextScanAt: null }, { nextScanAt: { lte: now } }],
    },
  });
  const activeJobs = await prisma.agentJob.groupBy({
    by: ['type', 'status'],
    where: { status: { in: [...ACTIVE] } },
    _count: true,
  });
  const dups = await prisma.$queryRaw<Array<{ source_id: string; cnt: bigint }>>`
    SELECT source_id, COUNT(*)::bigint as cnt
    FROM agent_jobs
    WHERE type = 'scan_source'
      AND status IN ('queued','claimed','running')
      AND source_id IS NOT NULL
    GROUP BY source_id
    HAVING COUNT(*) > 1
  `;
  const sourcesWithActiveScan = await prisma.agentJob.findMany({
    where: {
      type: 'scan_source',
      status: { in: [...ACTIVE] },
      sourceId: { not: null },
    },
    distinct: ['sourceId'],
    select: { sourceId: true },
  });

  return {
    now: now.toISOString(),
    activeSources,
    missingNextScanAt: missingNext,
    stillDue: due,
    sourcesWithActiveScanJob: sourcesWithActiveScan.length,
    activeJobs,
    remainingDuplicateScanGroups: dups.length,
  };
}

async function main() {
  console.log('=== ensure-source-scans-enqueued ===');

  const scanDedupe = await dedupeActiveScanJobs();
  console.log('DEDUPE scan_source', JSON.stringify(scanDedupe, null, 2));

  const publishDedupe = await dedupeActivePublishJobs();
  console.log('DEDUPE publish_social', JSON.stringify(publishDedupe, null, 2));

  const enqueue = await enqueueMissingDueSources();
  console.log(
    'ENQUEUE',
    JSON.stringify(
      {
        dueSources: enqueue.dueSources,
        enqueued: enqueue.enqueued,
        skipped: enqueue.skipped,
        results: enqueue.results,
      },
      null,
      2,
    ),
  );

  const after = await summary();
  console.log('AFTER', JSON.stringify(after, null, 2));
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
