import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const keepId = process.env.H0_KEEP_AGENT_JOB_ID || 'cmru0nnke006e13x4957e3e0t';
  const active = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
    },
    select: { id: true, status: true, attempts: true, errorMessage: true, payload: true },
  });

  const cancelled: string[] = [];
  for (const a of active) {
    if (a.id === keepId) continue;
    await p.agentJob.update({
      where: { id: a.id },
      data: {
        status: 'failed',
        errorMessage: 'h0_cancel_duplicate_cdp_storm',
        finishedAt: new Date(),
      },
    });
    cancelled.push(a.id);
  }

  // Reset keep job for a clean retry after selector fix deploy
  if (active.some(a => a.id === keepId)) {
    await p.agentJob.update({
      where: { id: keepId },
      data: {
        status: 'queued',
        claimedBy: null,
        claimedAt: null,
        startedAt: null,
        finishedAt: null,
        errorMessage: null,
        attempts: 0,
        availableAt: new Date(),
      },
    });
  }

  await p.socialPublishJob.update({
    where: { id: 'cmrtzh1et0001x8tchl2v4jqp' },
    data: {
      status: 'queued',
      claimedBy: null,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      scheduledAt: new Date(Date.now() - 5_000),
    },
  });

  const after = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
    },
    select: { id: true, status: true, attempts: true },
  });

  console.log(JSON.stringify({ cancelled, after }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
