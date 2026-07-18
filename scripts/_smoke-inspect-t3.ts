import { prisma } from '../server/prisma';

async function main() {
  const runId = process.argv[2] || 'cmrpqvob00011x6pcpssgftkn';
  const run = await prisma.socialCampaignRun.findUnique({
    where: { id: runId },
    include: { targets: true },
  });
  const jobs = await prisma.socialPublishJob.findMany({
    where: { id: { in: ['cmrpqvoba0013x6pcdl2t31n4', 'cmrpqvobw001dx6pc0glibbyr', 'cmrpqvocg001nx6pcs40hkck7'] } },
    include: { channel: true },
  });
  console.log(
    JSON.stringify(
      {
        run: run
          ? {
              id: run.id,
              status: run.status,
              progress: run.progress,
              targets: run.targets.map(t => ({
                id: t.id,
                status: t.status,
                channelId: t.channelId,
                publishJobId: t.publishJobId,
                errorMessage: t.errorMessage,
              })),
            }
          : null,
        jobs: jobs.map(j => ({
          id: j.id,
          status: j.status,
          attempts: j.attempts,
          maxAttempts: j.maxAttempts,
          errorCode: j.errorCode,
          errorMessage: j.errorMessage,
          channel: { id: j.channelId, type: j.channel?.type, name: j.channel?.name },
          scheduledAt: j.scheduledAt,
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
