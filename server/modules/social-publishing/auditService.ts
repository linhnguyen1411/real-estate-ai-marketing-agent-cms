import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';

export async function appendAuditLog(input: {
  entityType: string;
  entityId: string;
  action: string;
  actor?: string | null;
  metadata?: Record<string, unknown> | null;
  companyId?: string | null;
}): Promise<void> {
  await prisma.socialPublishAuditLog.create({
    data: {
      companyId: input.companyId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actor: input.actor ?? null,
      metadata: input.metadata
        ? (input.metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

export async function listAuditLogs(input: {
  entityType?: string;
  entityId?: string;
  companyId?: string | null;
  limit?: number;
}) {
  const take = Math.min(Math.max(input.limit ?? 50, 1), 200);
  return prisma.socialPublishAuditLog.findMany({
    where: {
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
