import type { Prisma } from '@prisma/client';
import {
  asDb,
  companyScopeWhere,
  type DbClient,
  type TenantContext,
} from '../shared/repositoryTypes';

export async function findExternalInventoryByIdForCompany(
  id: string,
  tenant: TenantContext,
  db?: DbClient,
) {
  return asDb(db).externalInventoryItem.findFirst({
    where: companyScopeWhere(tenant, { id }) as Prisma.ExternalInventoryItemWhereInput,
  });
}

export async function createExternalInventoryItem(
  data: Prisma.ExternalInventoryItemUncheckedCreateInput,
  db?: DbClient,
) {
  return asDb(db).externalInventoryItem.create({ data });
}

export async function updateExternalInventoryItem(
  id: string,
  data: Prisma.ExternalInventoryItemUncheckedUpdateInput,
  db?: DbClient,
) {
  return asDb(db).externalInventoryItem.update({ where: { id }, data });
}

export async function createExternalInventoryEvent(
  data: Prisma.ExternalInventoryEventUncheckedCreateInput,
  db?: DbClient,
) {
  return asDb(db).externalInventoryEvent.create({ data });
}

export async function createExternalInventorySource(
  data: Prisma.ExternalInventorySourceUncheckedCreateInput,
  db?: DbClient,
) {
  return asDb(db).externalInventorySource.create({ data });
}
