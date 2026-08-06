import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const jobs = await p.agentJob.findMany({
    where: { type: 'publish_social' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  console.log(
    JSON.stringify(
      jobs.map(j => ({
        id: j.id,
        status: j.status,
        payload: j.payload,
        errorMessage: j.errorMessage,
        updatedAt: j.updatedAt,
      })),
      null,
      2,
    ),
  );
}
main().finally(() => p.$disconnect());
