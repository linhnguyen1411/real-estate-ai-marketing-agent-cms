/**
 * Reset current publish job for retry after DOM fix (operator draft).
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const publishJobId = 'cmru4g1jo00ejaa2w8zh00zzu';
  const draftId = 'cmru4c64o0000xjf9f7gxnyqd';

  const agents = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      payload: { path: ['publishJobId'], equals: publishJobId },
      status: { in: ['queued', 'claimed', 'running', 'failed'] },
    },
  });
  for (const a of agents) {
    await p.agentJob.update({
      where: { id: a.id },
      data: {
        status: 'cancelled',
        errorMessage: 'retry_after_dom_fix',
        finishedAt: new Date(),
      },
    });
  }

  await p.socialPublishJob.update({
    where: { id: publishJobId },
    data: {
      status: 'queued',
      scheduledAt: new Date(Date.now() - 5_000),
      claimedBy: null,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
    },
  });
  await p.socialPostDraft.update({
    where: { id: draftId },
    data: { status: 'scheduled' },
  });

  const { enqueueAgentJobForPublishJob } = await import(
    '../server/modules/social-publishing/jobService'
  );
  const created = await enqueueAgentJobForPublishJob({
    id: publishJobId,
    companyId: 'comp-da-nang',
  });

  console.log(JSON.stringify({ ok: true, publishJobId, created, cancelledAgents: agents.length }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
