import { prisma } from '../server/prisma';

async function main() {
  const users = await prisma.user.findMany({ where: { email: { contains: 'linhnguyen' } } });
  console.log('Found linhnguyen users:', JSON.stringify(users, null, 2));
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
