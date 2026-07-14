import type { Prisma } from '@prisma/client';
import { asDb, type DbClient } from '../shared/repositoryTypes';

export async function findLeadById(id: string, db?: DbClient) {
  return asDb(db).lead.findUnique({ where: { id } });
}

export async function findLeadByPhone(phone: string, db?: DbClient) {
  return asDb(db).lead.findFirst({
    where: { phone },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function createLead(data: Prisma.LeadUncheckedCreateInput, db?: DbClient) {
  return asDb(db).lead.create({ data });
}

export async function updateLead(id: string, data: Prisma.LeadUncheckedUpdateInput, db?: DbClient) {
  return asDb(db).lead.update({ where: { id }, data });
}

export async function createLeadSource(data: Prisma.LeadSourceUncheckedCreateInput, db?: DbClient) {
  return asDb(db).leadSource.create({ data });
}

export async function createLeadScore(data: Prisma.LeadScoreUncheckedCreateInput, db?: DbClient) {
  return asDb(db).leadScore.create({ data });
}

export async function createLeadEvent(data: Prisma.LeadEventUncheckedCreateInput, db?: DbClient) {
  return asDb(db).leadEvent.create({ data });
}

export async function upsertLeadTag(
  leadId: string,
  tag: string,
  id: string,
  db?: DbClient,
) {
  const now = new Date();
  return asDb(db).leadTag.upsert({
    where: { leadId_tag: { leadId, tag } },
    create: { id, leadId, tag, createdAt: now },
    update: {},
  });
}
