import { prisma } from '../server/prisma';

async function main() {
  const publish = await prisma.socialPublishJob.findMany({
    where: { status: { in: ['queued', 'claimed', 'preparing', 'publishing'] } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, status: true, channelId: true, createdAt: true, result: true },
  });
  const agents = await prisma.agentJob.groupBy({
    by: ['type', 'status', 'priority'],
    where: { status: { in: ['queued', 'claimed', 'running'] } },
    _count: true,
  });
  const publishAgents = await prisma.agentJob.findMany({
    where: { type: 'publish_social', status: { in: ['queued', 'claimed', 'running', 'completed', 'failed'] } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      type: true,
      status: true,
      priority: true,
      createdAt: true,
      claimedBy: true,
      missionRunId: true,
      payload: true,
      errorMessage: true,
    },
  });
  console.log(JSON.stringify({ publish, agents, publishAgents }, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
