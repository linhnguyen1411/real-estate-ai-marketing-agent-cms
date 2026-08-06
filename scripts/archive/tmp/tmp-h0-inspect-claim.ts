import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const agentJobId = 'cmru0nnke006e13x4957e3e0t';
  const a = await p.agentJob.findUnique({ where: { id: agentJobId } });
  const agents = await p.agentWorker.findMany({
    orderBy: { lastSeenAt: 'desc' },
    take: 10,
    select: {
      id: true,
      name: true,
      status: true,
      lastSeenAt: true,
      capabilities: true,
      machineId: true,
    },
  });
  console.log(
    JSON.stringify(
      {
        jobPayload: a?.payload,
        jobStatus: a?.status,
        workers: agents,
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
  .finally(() => p.$disconnect());
