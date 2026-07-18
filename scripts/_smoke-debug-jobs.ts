import { prisma } from '../server/prisma';

async function main() {
  const bad = await prisma.socialPublishJob.findUnique({
    where: { id: 'cmrppgxuz001pnpznaelv4yn2' },
  });
  console.log('BAD_GROUP_RESULT', JSON.stringify(bad?.result, null, 2));

  const stuck = await prisma.agentJob.findUnique({
    where: { id: 'cmrpph10t0028npzn0guw8ond' },
  });
  console.log(
    'STUCK_AGENT',
    JSON.stringify(
      {
        status: stuck?.status,
        availableAt: stuck?.availableAt,
        companyId: stuck?.companyId,
        priority: stuck?.priority,
        errorMessage: stuck?.errorMessage,
        payload: stuck?.payload,
      },
      null,
      2,
    ),
  );

  const t2 = await prisma.socialPublishJob.findUnique({
    where: { id: 'cmrppgw8t000onpznpxwlarl9' },
  });
  console.log('T2_RESULT', JSON.stringify(t2?.result, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
