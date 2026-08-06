import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const [jobs, drafts] = await Promise.all([
    p.agentJob.groupBy({ by: ['status', 'type'], _count: true, orderBy: { status: 'asc' } }),
    p.socialPostDraft.groupBy({ by: ['status'], _count: true }),
  ]);
  console.log('AGENT_JOBS', JSON.stringify(jobs, null, 2));
  console.log('DRAFTS', JSON.stringify(drafts, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
