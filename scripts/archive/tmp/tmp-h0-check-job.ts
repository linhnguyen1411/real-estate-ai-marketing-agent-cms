import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const job = await p.socialPublishJob.findUnique({ where: { id: 'cmrtzh1et0001x8tchl2v4jqp' } });
  const draft = await p.socialPostDraft.findUnique({
    where: { id: 'cmrsypi1x02iamd6b83qzqik9' },
    select: { id: true, status: true },
  });
  console.log(JSON.stringify({ jobStatus: job?.status, jobError: job?.errorMessage, draft }, null, 2));
}
main().finally(() => p.$disconnect());
