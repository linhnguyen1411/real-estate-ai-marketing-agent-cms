import { PrismaClient } from '@prisma/client';
import { enqueueAgentJobForPublishJob } from '../server/modules/social-publishing/jobService';

const p = new PrismaClient();

async function main() {
  const publishJobId = 'cmrtzh1et0001x8tchl2v4jqp';

  // Fail any remaining active publish_social for this id
  const active = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
      payload: { path: ['publishJobId'], equals: publishJobId },
    },
  });
  for (const a of active) {
    await p.agentJob.update({
      where: { id: a.id },
      data: {
        status: 'failed',
        errorMessage: 'h0_reset_before_live_retry',
        finishedAt: new Date(),
      },
    });
  }

  await p.socialPublishJob.update({
    where: { id: publishJobId },
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

  await p.socialPostDraft.update({
    where: { id: 'cmrsypi1x02iamd6b83qzqik9' },
    data: { status: 'scheduled' },
  });

  const created = await enqueueAgentJobForPublishJob({
    id: publishJobId,
    companyId: 'comp-da-nang',
  });

  const agents = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      payload: { path: ['publishJobId'], equals: publishJobId },
    },
    orderBy: { updatedAt: 'desc' },
    take: 3,
    select: { id: true, status: true, attempts: true, errorMessage: true, createdAt: true },
  });

  console.log(JSON.stringify({ created, agents }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
