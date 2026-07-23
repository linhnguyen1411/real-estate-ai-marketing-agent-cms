import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const a = await p.agentJob.findUnique({ where: { id: 'cmru0nnke006e13x4957e3e0t' } });
  console.log(JSON.stringify({ status: a?.status, payload: a?.payload }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
