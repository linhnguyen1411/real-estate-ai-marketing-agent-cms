import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const channelId = 'cmrsykcjv02dgmd6byi2x0rug';
  const ch = await p.socialChannel.findUnique({ where: { id: channelId } });
  const allGroups = await p.socialChannel.findMany({
    where: { type: 'facebook_group', isActive: true },
    select: { id: true, name: true, type: true, config: true, isActive: true },
  });
  console.log(JSON.stringify({ channel: ch, allGroups }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
