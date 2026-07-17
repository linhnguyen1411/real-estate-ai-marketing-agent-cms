/**
 * Clear stuck agent jobs / mission runs, then enqueue fresh scans from
 * all active sources and start all active missions.
 *
 * Usage: npx tsx scripts/reset-and-enqueue-all.ts
 */
import { prisma } from '../server/prisma';
import { enqueueMissionRun, enqueueSourceScan } from '../server/agent/agentJobService';

const TRIGGERED_BY = 'ops-reset-enqueue';

async function main() {
  const activeStatuses = ['queued', 'claimed', 'running'] as const;

  const beforeJobs = await prisma.agentJob.groupBy({
    by: ['status'],
    _count: true,
  });
  const beforeActive = await prisma.agentJob.count({
    where: { status: { in: [...activeStatuses] } },
  });
  const beforeRuns = await prisma.agentMissionRun.count({
    where: { status: { in: ['queued', 'running'] } },
  });

  console.log('BEFORE', JSON.stringify({ jobs: beforeJobs, activeJobs: beforeActive, openMissionRuns: beforeRuns }, null, 2));

  const cancelledJobs = await prisma.agentJob.updateMany({
    where: { status: { in: [...activeStatuses] } },
    data: {
      status: 'cancelled',
      finishedAt: new Date(),
      errorMessage: 'Cancelled by ops-reset-enqueue (clear stuck queue)',
    },
  });

  const cancelledRuns = await prisma.agentMissionRun.updateMany({
    where: { status: { in: ['queued', 'running'] } },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
      error: 'Cancelled by ops-reset-enqueue',
    },
  });

  const cancelledStepRuns = await prisma.agentWorkflowStepRun.updateMany({
    where: { status: { in: ['queued', 'running', 'pending'] } },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
      errorMessage: 'Cancelled by ops-reset-enqueue',
    },
  });

  console.log('CLEARED', {
    cancelledJobs: cancelledJobs.count,
    cancelledMissionRuns: cancelledRuns.count,
    cancelledStepRuns: cancelledStepRuns.count,
  });

  const sources = await prisma.agentSource.findMany({
    where: { status: 'active' },
    orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, type: true, companyId: true, priority: true },
  });

  const missions = await prisma.agentMission.findMany({
    where: {
      status: { in: ['active', 'paused', 'draft'] },
      NOT: {
        OR: [
          { templateKey: 'publish-browser-content' },
          { name: { contains: 'Browser Publish' } },
        ],
      },
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, companyId: true, templateKey: true, status: true },
  });

  console.log(`Active sources: ${sources.length}, content missions: ${missions.length}`);

  // 1) Content missions first (creates scan_source jobs linked to MissionRun)
  const missionResults: Array<Record<string, unknown>> = [];
  for (const mission of missions) {
    try {
      if (mission.status !== 'active') {
        await prisma.agentMission.update({
          where: { id: mission.id },
          data: { status: 'active' },
        });
      }
      const r = await enqueueMissionRun({
        missionId: mission.id,
        companyId: mission.companyId || 'comp-da-nang',
        triggeredByUserId: TRIGGERED_BY,
      });
      missionResults.push({
        ok: true,
        missionId: mission.id,
        name: mission.name,
        missionRunId: r.missionRunId,
        jobsCreated: r.jobsCreated,
        jobsSkipped: r.jobsSkipped,
        jobIds: r.jobIds,
      });
      console.log(
        `  mission ✓ ${mission.name} → run ${r.missionRunId} (created=${r.jobsCreated}, skipped=${r.jobsSkipped})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      missionResults.push({ ok: false, missionId: mission.id, name: mission.name, error: message });
      console.log(`  mission ✗ ${mission.name}: ${message}`);
    }
  }

  // 2) Sources without an active scan yet (avoid duplicate active jobs)
  const sourceResults: Array<Record<string, unknown>> = [];
  for (const source of sources) {
    try {
      const active = await prisma.agentJob.findFirst({
        where: {
          sourceId: source.id,
          type: 'scan_source',
          status: { in: ['queued', 'claimed', 'running'] },
        },
        select: { id: true },
      });
      if (active) {
        sourceResults.push({
          ok: true,
          skipped: true,
          sourceId: source.id,
          name: source.name,
          existingJobId: active.id,
        });
        console.log(`  source · ${source.name} already queued (${active.id})`);
        continue;
      }

      const r = await enqueueSourceScan({
        sourceId: source.id,
        companyId: source.companyId || 'comp-da-nang',
        triggeredByUserId: TRIGGERED_BY,
      });
      sourceResults.push({
        ok: true,
        sourceId: source.id,
        name: source.name,
        type: source.type,
        jobId: r.jobId,
      });
      console.log(`  source ✓ ${source.name} (${source.type}) → ${r.jobId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sourceResults.push({ ok: false, sourceId: source.id, name: source.name, error: message });
      console.log(`  source ✗ ${source.name}: ${message}`);
    }
  }

  const after = await prisma.agentJob.findMany({
    where: { status: { in: [...activeStatuses] } },
    select: {
      id: true,
      type: true,
      status: true,
      sourceId: true,
      missionId: true,
      missionRunId: true,
      priority: true,
      createdAt: true,
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  const sessions = await prisma.browserSession.findMany({
    select: { workerId: true, status: true, lastHeartbeatAt: true },
    orderBy: { lastHeartbeatAt: 'desc' },
    take: 5,
  });

  console.log(
    '\nSUMMARY',
    JSON.stringify(
      {
        sourcesEnqueued: sourceResults.filter(r => r.ok).length,
        sourcesFailed: sourceResults.filter(r => !r.ok).length,
        missionsEnqueued: missionResults.filter(r => r.ok).length,
        missionsFailed: missionResults.filter(r => !r.ok).length,
        queuedNow: after.length,
        jobs: after,
        browserSessions: sessions,
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
