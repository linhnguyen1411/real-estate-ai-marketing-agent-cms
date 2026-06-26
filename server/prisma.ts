import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === '1' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function checkDatabaseConnection(): Promise<{ ok: boolean; message: string }> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, message: 'DATABASE_URL is not set' };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, message: 'postgresql' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}
