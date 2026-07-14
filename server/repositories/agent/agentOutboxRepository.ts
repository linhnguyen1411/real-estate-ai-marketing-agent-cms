import type { Prisma } from '@prisma/client';
import { asDb, type DbClient } from '../shared/repositoryTypes';

export async function findOutboxByIngestionId(ingestionId: string, db?: DbClient) {
  return asDb(db).agentSyncOutbox.findUnique({ where: { ingestionId } });
}

export async function createOutbox(
  data: Prisma.AgentSyncOutboxCreateInput,
  db?: DbClient,
) {
  return asDb(db).agentSyncOutbox.create({ data });
}

export async function countOutboxByStatus(status: string, db?: DbClient) {
  return asDb(db).agentSyncOutbox.count({ where: { status } });
}
