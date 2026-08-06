import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const draftId = process.argv[2] || 'cmru4c64o0000xjf9f7gxnyqd';
  const draft = await p.socialPostDraft.findUnique({
    where: { id: draftId },
    include: { jobs: { orderBy: { updatedAt: 'desc' }, take: 5 } },
  });
  const jobs = await p.socialPublishJob.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 8,
    select: {
      id: true,
      status: true,
      errorMessage: true,
      updatedAt: true,
      draftId: true,
    },
  });
  const agents = await p.agentJob.findMany({
    where: { type: 'publish_social' },
    orderBy: { updatedAt: 'desc' },
    take: 8,
    select: {
      id: true,
      status: true,
      errorMessage: true,
      updatedAt: true,
      payload: true,
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
                error: j.errorMessage,
              })),
            }
          : null,
        jobs,
        agents,
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
