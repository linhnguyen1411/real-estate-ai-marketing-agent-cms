/**
 * Shared DB client types for repositories (PrismaClient | TransactionClient).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma';

export type TransactionClient = Prisma.TransactionClient;
export type DbClient = PrismaClient | TransactionClient;

export type TenantContext = {
  companyId: string | null;
  /** When true (owner), skip companyId filter on reads. Writes still stamp companyId when provided. */
  bypassCompanyScope?: boolean;
};

export function asDb(db?: DbClient): DbClient {
  return db ?? defaultPrisma;
}

export function companyScopeWhere(
  tenant: TenantContext,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  if (tenant.bypassCompanyScope) return { ...extra };
  return { companyId: tenant.companyId ?? '__none__', ...extra };
}

export async function runInTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options?: { timeoutMs?: number; maxWaitMs?: number },
): Promise<T> {
  const started = Date.now();
  try {
    return await defaultPrisma.$transaction(fn, {
      maxWait: options?.maxWaitMs ?? 10_000,
      timeout: options?.timeoutMs ?? 30_000,
    });
  } finally {
    const ms = Date.now() - started;
    if (ms > 5_000) {
      console.warn(`[db] transaction duration ${ms}ms exceeds soft threshold`);
    }
  }
}
