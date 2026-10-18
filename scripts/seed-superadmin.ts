import { prisma } from '../server/prisma';
import { hashPassword } from '../server/modules/auth/password';

async function main() {
  const hash = await hashPassword('admin123');

  // 1. Ensure admin@example.com exists as Super Admin
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    create: {
      id: 'u-admin-super',
      email: 'admin@example.com',
      role: 'owner',
      status: 'active',
      passwordHash: hash,
      data: {
        id: 'u-admin-super',
        name: 'Super Admin',
        email: 'admin@example.com',
        role: 'owner',
        status: 'active',
        password_hash: hash,
        version: 1,
      },
    },
    update: {
      role: 'owner',
      status: 'active',
      passwordHash: hash,
      data: {
        id: 'u-admin-super',
        name: 'Super Admin',
        email: 'admin@example.com',
        role: 'owner',
        status: 'active',
        password_hash: hash,
        version: 1,
      },
    },
  });

  // 2. Ensure owner@example.com exists as Super Admin
  const owner = await prisma.user.findUnique({ where: { email: 'owner@example.com' } });
  if (owner) {
    const ownerData = (typeof owner.data === 'object' && owner.data !== null ? owner.data : {}) as Record<string, any>;
    delete ownerData.password;
    ownerData.password_hash = hash;
    await prisma.user.update({
      where: { email: 'owner@example.com' },
      data: {
        role: 'owner',
        status: 'active',
        passwordHash: hash,
        data: ownerData,
      },
    });
  }

  console.log('Successfully synced Super Admin accounts (admin@example.com & owner@example.com)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
