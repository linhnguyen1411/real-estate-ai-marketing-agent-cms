import { prisma } from '../server/prisma';

async function main() {
  const jobId = process.argv[2] || 'cmrppvhgx000a12ttc234s8oh';
  const pub = await prisma.socialPublishJob.findUnique({ where: { id: jobId } });
  const agents = await prisma.agentJob.findMany({
    where: {
      type: 'publish_social',
      OR: [
        { payload: { path: ['publishJobId'], equals: jobId } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  // also by missionRunId from result
  const missionRunId =
    pub?.result && typeof pub.result === 'object'
      ? (pub.result as { missionRunId?: string }).missionRunId
      : undefined;
  const byMission = missionRunId
    ? await prisma.agentJob.findMany({
        where: { missionRunId },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const runs = await prisma.agentMissionRun.findMany({
    where: {
      id: {
        in: [
          ...agents.map(a => a.missionRunId).filter(Boolean),
          ...byMission.map(a => a.missionRunId).filter(Boolean),
          missionRunId,
        ].filter(Boolean) as string[],
      },
    },
  });
  console.log(
    JSON.stringify(
      {
        pub: {
          id: pub?.id,
          status: pub?.status,
          errorMessage: pub?.errorMessage,
          result: pub?.result,
          attempts: (pub as { attempts?: number } | null)?.attempts,
        },
        agents: agents.map(a => ({
          id: a.id,
          status: a.status,
          missionRunId: a.missionRunId,
          claimedBy: a.claimedBy,
          startedAt: a.startedAt,
          finishedAt: a.finishedAt,
          errorMessage: a.errorMessage,
          result: a.result,
          payload: a.payload,
        })),
        byMission: byMission.map(a => ({
          id: a.id,
          status: a.status,
          errorMessage: a.errorMessage,
          result: a.result,
        })),
        runs,
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
