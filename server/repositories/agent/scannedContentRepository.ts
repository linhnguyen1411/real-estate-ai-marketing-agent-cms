import type { Prisma } from '@prisma/client';
import {
  asDb,
  companyScopeWhere,
  type DbClient,
  type TenantContext,
} from '../shared/repositoryTypes';

export async function findScannedContentByIdForCompany(
  id: string,
  tenant: TenantContext,
  db?: DbClient,
) {
  return asDb(db).scannedContent.findFirst({
    where: companyScopeWhere(tenant, { id }) as Prisma.ScannedContentWhereInput,
  });
}

export async function findScannedContentByExternalId(
  sourceId: string,
  externalId: string,
  tenant: TenantContext,
  db?: DbClient,
) {
  return asDb(db).scannedContent.findFirst({
    where: companyScopeWhere(tenant, { sourceId, externalId }) as Prisma.ScannedContentWhereInput,
  });
}

export async function findScannedContentByCanonicalUrl(
  canonicalUrl: string,
  tenant: TenantContext,
  db?: DbClient,
) {
  return asDb(db).scannedContent.findFirst({
    where: companyScopeWhere(tenant, { canonicalUrl }) as Prisma.ScannedContentWhereInput,
  });
}

export async function findScannedContentByNormalizedHash(
  sourceId: string,
  normalizedContentHash: string,
  tenant: TenantContext,
  db?: DbClient,
) {
  return asDb(db).scannedContent.findFirst({
    where: companyScopeWhere(tenant, {
      sourceId,
      normalizedContentHash,
    }) as Prisma.ScannedContentWhereInput,
  });
}

export async function createScannedContent(
  data: Prisma.ScannedContentUncheckedCreateInput,
  db?: DbClient,
) {
  return asDb(db).scannedContent.create({ data });
}

export async function updateScannedContent(
  id: string,
  data: Prisma.ScannedContentUpdateInput,
  db?: DbClient,
) {
  return asDb(db).scannedContent.update({ where: { id }, data });
}
