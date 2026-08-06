import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const draft = await p.socialPostDraft.findFirst({
    orderBy: { updatedAt: 'desc' },
    include: { media: true, jobs: { orderBy: { updatedAt: 'desc' }, take: 3 } },
  });
  const jobs = await p.socialPublishJob.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: { channel: { select: { name: true, type: true } } },
  });
  const agents = await p.agentJob.findMany({
    where: { type: 'publish_social' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      attempts: true,
      errorMessage: true,
      claimedBy: true,
      result: true,
      payload: true,
      updatedAt: true,
      createdAt: true,
      finishedAt: true,
    },
  });
  console.log(
    JSON.stringify(
      {
        draft: draft
          ? {
              id: draft.id,
              status: draft.status,
              jobs: draft.jobs.map(j => ({
                id: j.id,
                status: j.status,
                scheduledAt: j.scheduledAt,
                error: j.errorMessage,
              })),
            }
          : null,
        jobs: jobs.map(j => ({
          id: j.id,
          status: j.status,
          scheduledAt: j.scheduledAt,
          channel: j.channel ? `${j.channel.type}:${j.channel.name}` : null,
          error: j.errorMessage,
          result: j.result,
        })),
        agents: agents.map(a => ({
          id: a.id,
          status: a.status,
          attempts: a.attempts,
          error: a.errorMessage,
          claimedBy: a.claimedBy,
          publishJobId: (a.payload as any)?.publishJobId,
          resultPhase: (a.result as any)?.phase,
          resultReason: (a.result as any)?.data?.reason || (a.result as any)?.reason,
          updatedAt: a.updatedAt,
        })),
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
