import { prisma } from '../server/prisma';

async function main() {
  const sources = await prisma.agentSource.findMany({
    where: { status: 'active', type: 'facebook_group' },
    select: { id: true, name: true, url: true, priority: true },
    orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    take: 8,
  });
  console.log(JSON.stringify(sources, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
