import type { Prisma } from '@prisma/client';
import {
  asDb,
  companyScopeWhere,
  type DbClient,
  type TenantContext,
} from '../shared/repositoryTypes';

export async function findFindingByIdForCompany(
  id: string,
  tenant: TenantContext,
  db?: DbClient,
  include?: Prisma.AgentFindingInclude,
) {
  const client = asDb(db);
  return client.agentFinding.findFirst({
    where: companyScopeWhere(tenant, { id }) as Prisma.AgentFindingWhereInput,
    include,
  });
}

/** Owner-bypass load with optional company stamp check left to caller. */
export async function findFindingById(id: string, db?: DbClient, include?: Prisma.AgentFindingInclude) {
  return asDb(db).agentFinding.findUnique({
    where: { id },
    include,
  });
}

export async function updateFindingLifecycle(
  id: string,
  tenant: TenantContext,
  data: Prisma.AgentFindingUpdateInput,
  db?: DbClient,
) {
  const client = asDb(db);
  const scoped = await findFindingByIdForCompany(id, tenant, client);
  if (!scoped) return { count: 0 };
  await client.agentFinding.update({ where: { id }, data });
  return { count: 1 };
}

export async function bulkUpdateFindingStatusScoped(
  tenant: TenantContext,
  ids: string[],
  data: Prisma.AgentFindingUpdateManyMutationInput,
  db?: DbClient,
) {
  if (!ids.length) return { count: 0 };
  return asDb(db).agentFinding.updateMany({
    where: companyScopeWhere(tenant, { id: { in: ids } }) as Prisma.AgentFindingWhereInput,
    data,
  });
}

export async function findFindingByScannedContentAndType(
  scannedContentId: string,
  type: string,
  tenant: TenantContext,
  db?: DbClient,
) {
  return asDb(db).agentFinding.findFirst({
    where: companyScopeWhere(tenant, { scannedContentId, type }) as Prisma.AgentFindingWhereInput,
  });
}
