import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const draftId = process.argv[2] || 'cmru4c64o0000xjf9f7gxnyqd';

async function main() {
  const draft = await p.socialPostDraft.findUnique({
    where: { id: draftId },
    include: {
      jobs: { orderBy: { updatedAt: 'desc' }, take: 5 },
    },
  });
  console.log(
    JSON.stringify(
      {
        draftStatus: draft?.status,
        jobs: draft?.jobs?.map((j) => ({
          id: j.id,
          status: j.status,
          error: j.errorMessage,
          updatedAt: j.updatedAt,
          result: j.result,
        })),
      },
      null,
      2,
    ),
  );

  const aj = await p.agentJob.findMany({
    where: { type: 'publish_social' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      errorMessage: true,
      updatedAt: true,
      result: true,
      payload: true,
    },
  });
  console.log('agentJobs', JSON.stringify(aj, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
