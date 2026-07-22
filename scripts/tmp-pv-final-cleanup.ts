import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const open = await p.socialPublishJob.findMany({
    where: { status: { in: ['queued', 'claimed', 'preparing', 'publishing'] } },
    select: { id: true, status: true, idempotencyKey: true },
  });
  const agents = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
    },
    select: { id: true, status: true },
  });
  for (const a of agents) {
    await p.agentJob.update({
      where: { id: a.id },
      data: { status: 'cancelled', errorMessage: 'pv_cleanup', finishedAt: new Date() },
    });
  }
  // cancel leftover pv drafts
  await p.socialPostDraft.updateMany({
    where: { body: { contains: 'pv-validate' }, status: { not: 'cancelled' } },
    data: { status: 'cancelled' },
  });
  console.log(JSON.stringify({ open, cancelledAgents: agents.map(a => a.id) }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
