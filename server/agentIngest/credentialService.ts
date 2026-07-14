/**
 * Agent API credential persistence — moved out of ingestRoutes.
 */
import crypto from 'crypto';
import { prisma } from '../prisma';
import type { AuthUser } from '../../src/types';
import { buildCompanyScopeFilter } from '../agent/agentDb';

export async function listAgentApiCredentials(user: AuthUser) {
  const scope = buildCompanyScopeFilter(user);
  return prisma.agentApiCredential.findMany({
    where: scope,
    orderBy: { createdAt: 'desc' },
  });
}

export async function createAgentApiCredential(input: {
  user: AuthUser;
  name: string;
  companyId?: string | null;
}) {
  const companyId =
    input.user.role === 'owner' ? input.companyId ?? input.user.company_id ?? null : input.user.company_id ?? null;
  const keyId = `key_${crypto.randomBytes(8).toString('hex')}`;
  const secret = crypto.randomBytes(24).toString('hex');
  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
  const row = await prisma.agentApiCredential.create({
    data: {
      companyId,
      name: input.name || 'Ingest credential',
      keyId,
      secretHash,
      status: 'active',
    },
  });
  return { row, secret };
}

export async function updateAgentApiCredential(input: {
  user: AuthUser;
  id: string;
  name?: string;
  status?: string;
}) {
  const scope = buildCompanyScopeFilter(input.user);
  const existing = await prisma.agentApiCredential.findFirst({
    where: { id: input.id, ...scope },
  });
  if (!existing) return null;
  return prisma.agentApiCredential.update({
    where: { id: input.id },
    data: {
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.status != null ? { status: input.status } : {}),
    },
  });
}
