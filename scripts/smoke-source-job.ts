import { prisma } from '../server/prisma';
import { enqueueSourceScan } from '../server/agent/agentJobService';
import { completeMissionRunIfSettled } from '../server/modules/mission-engine/repositories/missionRunRepository';

async function sleep(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

async function main() {
  // Close any open mission runs that have no pending work
  const open = await prisma.agentMissionRun.findMany({
    where: { status: { in: ['queued', 'running'] } },
    select: { id: true },
    take: 20,
  });
  for (const r of open) {
    await completeMissionRunIfSettled(r.id);
  }

  const source = await prisma.agentSource.findFirst({
    where: { status: 'active', type: 'facebook_group' },
    orderBy: { priority: 'asc' },
  });
  if (!source) throw new Error('No active facebook_group source');

  // Prefer observing an in-flight/completed scan from current worker first
  const recent = await prisma.agentJob.findFirst({
    where: {
      type: 'scan_source',
      status: 'completed',
      finishedAt: { gte: new Date(Date.now() - 15 * 60_000) },
      claimedBy: { startsWith: 'worker-' },
    },
    orderBy: { finishedAt: 'desc' },
  });

  let jobId = recent?.id ?? null;
  let enqueued = false;
  if (!jobId) {
    const active = await prisma.agentJob.findFirst({
      where: {
        sourceId: source.id,
        type: 'scan_source',
        status: { in: ['queued', 'claimed', 'running'] },
      },
    });
    if (active) {
      jobId = active.id;
    } else {
      const r = await enqueueSourceScan({
        sourceId: source.id,
        companyId: source.companyId || 'comp-da-nang',
        triggeredByUserId: 'smoke-source-job',
      });
      jobId = r.jobId;
      enqueued = true;
    }
  }

  console.log(JSON.stringify({ watchingJobId: jobId, enqueued, sourceId: source.id }, null, 2));

  let final = await prisma.agentJob.findUnique({ where: { id: jobId! } });
  for (let i = 0; i < 40 && final && !['completed', 'failed', 'cancelled'].includes(final.status); i++) {
    await sleep(3000);
    final = await prisma.agentJob.findUnique({ where: { id: jobId! } });
    console.log(`poll ${i + 1}: ${final?.status}`);
  }

  const contents = await prisma.scannedContent.count({
    where: { sourceId: source.id, collectedAt: { gte: new Date(Date.now() - 20 * 60_000) } },
  });

  console.log(
    JSON.stringify(
      {
        job: final && {
          id: final.id,
          status: final.status,
          missionId: final.missionId,
          missionRunId: final.missionRunId,
          claimedBy: final.claimedBy,
          startedAt: final.startedAt,
          finishedAt: final.finishedAt,
          errorMessage: final.errorMessage,
          resultKeys: final.result && typeof final.result === 'object' ? Object.keys(final.result as object) : [],
        },
        recentContents: contents,
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
