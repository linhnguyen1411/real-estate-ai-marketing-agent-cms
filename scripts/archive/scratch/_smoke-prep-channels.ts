import { prisma } from '../server/prisma';

async function main() {
  const channels = await prisma.socialChannel.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      type: true,
      executionMode: true,
      status: true,
      profileUrl: true,
      externalId: true,
      config: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  const activeJobs = await prisma.agentJob.groupBy({
    by: ['status', 'type'],
    where: { status: { in: ['queued', 'claimed', 'running'] } },
    _count: true,
  });
  const sessions = await prisma.browserSession.findMany({
    orderBy: { lastHeartbeatAt: 'desc' },
    take: 5,
    select: { workerId: true, status: true, lastHeartbeatAt: true },
  });
  console.log(JSON.stringify({ channels, activeJobs, sessions }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
