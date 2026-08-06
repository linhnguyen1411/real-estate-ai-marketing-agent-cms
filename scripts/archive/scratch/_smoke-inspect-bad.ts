import { prisma } from '../server/prisma';

async function main() {
  const id = process.argv[2] || 'cmrpreoll001nl6en4ybr4u0q';
  const job = await prisma.socialPublishJob.findUnique({
    where: { id },
    include: { channel: true },
  });
  const agents = await prisma.agentJob.findMany({
    where: {
      type: 'publish_social',
      OR: [
        { payload: { path: ['publishJobId'], equals: id } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const allPublish = await prisma.socialPublishJob.findMany({
    where: {
      id: {
        in: ['cmrpreokm0013l6eny4ru7mzy', 'cmrpreol5001dl6enpofo4x1u', 'cmrpreoll001nl6en4ybr4u0q'],
      },
    },
  });
  console.log(
    JSON.stringify(
      {
        job: {
          id: job?.id,
          status: job?.status,
          attempts: job?.attempts,
          maxAttempts: job?.maxAttempts,
          scheduledAt: job?.scheduledAt,
          errorCode: job?.errorCode,
          errorMessage: job?.errorMessage,
          channel: job?.channel?.name,
          result: job?.result,
        },
        allPublish: allPublish.map(j => ({
          id: j.id,
          status: j.status,
          attempts: j.attempts,
          scheduledAt: j.scheduledAt,
          errorMessage: j.errorMessage?.slice(0, 80),
        })),
        agents: agents.map(a => ({
          id: a.id,
          status: a.status,
          createdAt: a.createdAt,
          finishedAt: a.finishedAt,
          availableAt: a.availableAt,
          errorMessage: a.errorMessage,
          result: a.result,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
