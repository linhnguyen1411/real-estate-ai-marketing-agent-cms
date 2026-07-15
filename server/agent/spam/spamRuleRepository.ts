/**
 * AgentSpamRule persistence + mapping to domain SpamRule.
 */
import type { AgentSpamRule, Prisma } from '@prisma/client';
import { Prisma as PrismaRuntime } from '@prisma/client';
import { prisma } from '../../prisma';
import type { SpamRule, SpamRuleAction, SpamRuleType } from './spamTypes';
import { normalizeSpamPhoneInput } from './phoneSpam';
import { invalidateSpamRulesCache } from './spamRuleCache';

export function toDomainSpamRule(row: AgentSpamRule): SpamRule {
  return {
    id: row.id,
    companyId: row.companyId,
    sourceId: row.sourceId,
    missionId: row.missionId,
    findingType: row.findingType,
    type: row.type as SpamRuleType,
    action: row.action as SpamRuleAction,
    rawValue: row.rawValue,
    normalizedValue: row.normalizedValue,
    e164Value: row.e164Value,
    pattern: row.pattern,
    label: row.label,
    reason: row.reason,
    priority: row.priority,
    isActive: row.isActive && !row.archivedAt,
    expiresAt: row.expiresAt,
    metadata: (row.metadata as Record<string, unknown> | null) || null,
  };
}

export type ListSpamRulesFilter = {
  companyId?: string | null;
  /** When true (non-owner), restrict to this company OR global null company */
  tenantCompanyId?: string | null;
  sourceId?: string | null;
  type?: string | null;
  action?: string | null;
  active?: boolean | null;
  search?: string | null;
  expired?: boolean | null;
  includeArchived?: boolean;
  page?: number;
  limit?: number;
};

function buildWhere(filter: ListSpamRulesFilter): Prisma.AgentSpamRuleWhereInput {
  const now = new Date();
  const and: Prisma.AgentSpamRuleWhereInput[] = [];

  if (!filter.includeArchived) {
    and.push({ archivedAt: null });
  }

  if (filter.tenantCompanyId) {
    and.push({
      OR: [{ companyId: filter.tenantCompanyId }, { companyId: null }],
    });
  } else if (filter.companyId !== undefined) {
    and.push({ companyId: filter.companyId });
  }

  if (filter.sourceId) and.push({ sourceId: filter.sourceId });
  if (filter.type) and.push({ type: filter.type });
  if (filter.action) and.push({ action: filter.action });
  if (filter.active === true) and.push({ isActive: true });
  if (filter.active === false) and.push({ isActive: false });

  if (filter.expired === true) {
    and.push({ expiresAt: { lte: now } });
  } else if (filter.expired === false) {
    and.push({
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    });
  }

  if (filter.search?.trim()) {
    const q = filter.search.trim();
    and.push({
      OR: [
        { rawValue: { contains: q, mode: 'insensitive' } },
        { normalizedValue: { contains: q, mode: 'insensitive' } },
        { e164Value: { contains: q, mode: 'insensitive' } },
        { label: { contains: q, mode: 'insensitive' } },
        { reason: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export async function listSpamRules(filter: ListSpamRulesFilter = {}) {
  const page = Math.max(1, filter.page || 1);
  const limit = Math.min(200, Math.max(1, filter.limit || 50));
  const where = buildWhere(filter);
  const [total, rows] = await Promise.all([
    prisma.agentSpamRule.count({ where }),
    prisma.agentSpamRule.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { total, page, limit, rows };
}

/** Active rules for evaluation: company + global, optionally source-scoped + global sources. */
export async function loadActiveSpamRulesForScan(opts: {
  companyId?: string | null;
  sourceId?: string | null;
}): Promise<SpamRule[]> {
  const now = new Date();
  const rows = await prisma.agentSpamRule.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      AND: [
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        {
          OR: [
            { companyId: null },
            ...(opts.companyId ? [{ companyId: opts.companyId }] : []),
          ],
        },
        {
          OR: [
            { sourceId: null },
            ...(opts.sourceId ? [{ sourceId: opts.sourceId }] : []),
          ],
        },
      ],
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toDomainSpamRule);
}

export type CreateSpamRuleInput = {
  companyId?: string | null;
  sourceId?: string | null;
  missionId?: string | null;
  findingType?: string | null;
  type: SpamRuleType | string;
  action: SpamRuleAction | string;
  rawValue: string;
  normalizedValue?: string | null;
  e164Value?: string | null;
  pattern?: string | null;
  label?: string | null;
  reason?: string | null;
  priority?: number;
  isActive?: boolean;
  expiresAt?: Date | string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
};

function normalizeCreateFields(input: CreateSpamRuleInput): {
  rawValue: string;
  normalizedValue: string | null;
  e164Value: string | null;
  pattern: string | null;
} {
  const rawValue = String(input.rawValue || '').trim();
  if (!rawValue) throw new Error('rawValue is required');

  if (input.type === 'phone') {
    const phone = normalizeSpamPhoneInput(rawValue);
    if (!phone) throw new Error('Invalid Vietnam phone number');
    return {
      rawValue,
      normalizedValue: phone.normalizedValue,
      e164Value: phone.e164Value,
      pattern: null,
    };
  }

  const normalized =
    input.normalizedValue != null
      ? String(input.normalizedValue).trim()
      : rawValue.toLowerCase().trim();

  return {
    rawValue,
    normalizedValue: normalized || null,
    e164Value: input.e164Value ? String(input.e164Value) : null,
    pattern: input.pattern != null ? String(input.pattern) : input.type === 'regex' ? rawValue : null,
  };
}

export async function createSpamRule(input: CreateSpamRuleInput): Promise<AgentSpamRule> {
  const fields = normalizeCreateFields(input);
  const row = await prisma.agentSpamRule.create({
    data: {
      companyId: input.companyId ?? null,
      sourceId: input.sourceId ?? null,
      missionId: input.missionId ?? null,
      findingType: input.findingType ?? null,
      type: String(input.type),
      action: String(input.action),
      rawValue: fields.rawValue,
      normalizedValue: fields.normalizedValue,
      e164Value: fields.e164Value,
      pattern: fields.pattern,
      label: input.label ?? null,
      reason: input.reason ?? null,
      priority: input.priority ?? 100,
      isActive: input.isActive !== false,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
      createdBy: input.createdBy ?? null,
    },
  });
  invalidateSpamRulesCache(input.companyId ?? null);
  return row;
}

export async function updateSpamRule(
  id: string,
  patch: Partial<CreateSpamRuleInput> & { archivedAt?: Date | null },
): Promise<AgentSpamRule | null> {
  const existing = await prisma.agentSpamRule.findUnique({ where: { id } });
  if (!existing) return null;

  const type = (patch.type as string) || existing.type;
  let fields: { rawValue?: string; normalizedValue?: string | null; e164Value?: string | null; pattern?: string | null } =
    {};
  if (patch.rawValue != null || patch.type != null) {
    const normalized = normalizeCreateFields({
      type,
      action: (patch.action as string) || existing.action,
      rawValue: patch.rawValue != null ? String(patch.rawValue) : existing.rawValue,
      normalizedValue: patch.normalizedValue,
      e164Value: patch.e164Value,
      pattern: patch.pattern,
    });
    fields = normalized;
  }

  const row = await prisma.agentSpamRule.update({
    where: { id },
    data: {
      ...(patch.companyId !== undefined ? { companyId: patch.companyId } : {}),
      ...(patch.sourceId !== undefined ? { sourceId: patch.sourceId } : {}),
      ...(patch.missionId !== undefined ? { missionId: patch.missionId } : {}),
      ...(patch.findingType !== undefined ? { findingType: patch.findingType } : {}),
      ...(patch.type !== undefined ? { type: String(patch.type) } : {}),
      ...(patch.action !== undefined ? { action: String(patch.action) } : {}),
      ...(fields.rawValue !== undefined ? { rawValue: fields.rawValue } : {}),
      ...(fields.normalizedValue !== undefined ? { normalizedValue: fields.normalizedValue } : {}),
      ...(fields.e164Value !== undefined ? { e164Value: fields.e164Value } : {}),
      ...(fields.pattern !== undefined ? { pattern: fields.pattern } : {}),
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.expiresAt !== undefined
        ? { expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : null }
        : {}),
      ...(patch.metadata !== undefined
        ? { metadata: (patch.metadata as Prisma.InputJsonValue) ?? PrismaRuntime.DbNull }
        : {}),
      ...(patch.archivedAt !== undefined ? { archivedAt: patch.archivedAt } : {}),
    },
  });
  invalidateSpamRulesCache(row.companyId);
  invalidateSpamRulesCache(existing.companyId);
  return row;
}

export async function archiveSpamRule(id: string): Promise<AgentSpamRule | null> {
  return updateSpamRule(id, { isActive: false, archivedAt: new Date() });
}

export async function getSpamRuleById(id: string): Promise<AgentSpamRule | null> {
  return prisma.agentSpamRule.findUnique({ where: { id } });
}
