import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const social = await p.socialPublishJob.findUnique({ where: { id: 'cmrtzh1et0001x8tchl2v4jqp' } });
  const latest = await p.agentJob.findFirst({
    where: { type: 'publish_social', payload: { path: ['publishJobId'], equals: 'cmrtzh1et0001x8tchl2v4jqp' } },
    orderBy: { updatedAt: 'desc' },
  });
  const activeChannel = await p.socialPublishJob.findMany({
    where: {
      channelId: social?.channelId,
      status: { in: ['claimed', 'preparing', 'publishing'] },
    },
    select: { id: true, status: true, claimedBy: true },
  });
  console.log(
    JSON.stringify(
      {
        socialStatus: social?.status,
        socialResult: social?.result,
        latestAgent: latest
          ? {
              id: latest.id,
              status: latest.status,
              result: latest.result,
              errorMessage: latest.errorMessage,
              updatedAt: latest.updatedAt,
            }
          : null,
        activeOnChannel: activeChannel,
      },
      null,
      2,
    ),
  );
}
main().finally(() => p.$disconnect());
