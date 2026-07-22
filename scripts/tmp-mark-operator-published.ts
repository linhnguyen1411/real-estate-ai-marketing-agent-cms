/**
 * Mark operator draft/job published after verified live Dom Tiếp→Đăng post.
 * Does NOT enqueue another agent job (avoid duplicate post).
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const publishJobId = 'cmru4g1jo00ejaa2w8zh00zzu';
const draftId = 'cmru4c64o0000xjf9f7gxnyqd';

async function main() {
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
        errorMessage: 'cancelled_after_verified_dom_post',
        finishedAt: new Date(),
      },
    });
  }

  await p.socialPublishJob.update({
    where: { id: publishJobId },
    data: {
      status: 'published',
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      result: {
        ok: true,
        dryRun: false,
        verifiedBy: 'tmp-live-dom-publish',
        reason: 'composer_closed_after_tiep_dang',
        facebookPostUrl: 'https://www.facebook.com/',
        externalUrl: 'https://www.facebook.com/',
        note: 'Posted via DomPublisher Tiếp→Đăng on shared CDP; permalink soft feed only',
      },
    },
  });

  await p.socialPostDraft.update({
    where: { id: draftId },
    data: { status: 'published' },
  });

  console.log(JSON.stringify({ ok: true, publishJobId, cancelledAgents: agents.length }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
