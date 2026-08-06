import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient();

async function main() {
  const d = await p.socialPostDraft.findUnique({
    where: { id: 'cmru4c64o0000xjf9f7gxnyqd' },
    select: { body: true },
  });
  if (!d?.body) throw new Error('no body');
  fs.writeFileSync('/tmp/draft-body-full.txt', d.body, 'utf8');
  console.log(JSON.stringify({ ok: true, bodyLen: d.body.length }));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
