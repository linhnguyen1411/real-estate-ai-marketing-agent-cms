import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const d = await p.socialPostDraft.findUnique({
    where: { id: 'cmru4c64o0000xjf9f7gxnyqd' },
    select: { id: true, body: true, title: true, status: true },
  });
  console.log(
    JSON.stringify(
      {
        id: d?.id,
        status: d?.status,
        title: d?.title,
        bodyLen: d?.body?.length,
        bodyHead: (d?.body || '').slice(0, 300),
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
