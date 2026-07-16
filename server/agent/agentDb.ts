import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../src/types';
import { resolveLeadIntelligence, toLeadIntelligenceListDTO } from '../../shared/agent-domain';
import { prisma } from '../prisma';
import type { AgentDashboardCounts, MissionRules, PaginatedMeta, PaginationInput } from './agentTypes';

export function buildCompanyScopeFilter(user: AuthUser): { companyId?: string } {
  if (user.role === 'owner') return {};
  return { companyId: user.company_id ?? '__none__' };
}

export function canManageAgentConfig(user: AuthUser): boolean {
  return user.role === 'owner' || user.role === 'company';
}

export function canAccessAgentRecord(user: AuthUser, companyId: string | null | undefined): boolean {
  if (user.role === 'owner') return true;
  return companyId === user.company_id;
}

export function paginatedMeta(total: number, pagination: PaginationInput): PaginatedMeta {
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
  };
}

export async function getAgentDashboardCounts(user: AuthUser): Promise<AgentDashboardCounts> {
  const companyScope = buildCompanyScopeFilter(user);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const notificationWhere: Prisma.AgentNotificationWhereInput = {
    ...companyScope,
    status: 'unread',
    ...(user.role === 'member' ? { OR: [{ userId: user.id }, { userId: null }] } : {}),
  };

  const [
    activeSources,
    queuedJobs,
    runningJobs,
    newFindings,
    unreadNotifications,
    jobsFailed24h,
    sourcesWithError,
    recentSources,
  ] = await Promise.all([
    prisma.agentSource.count({ where: { ...companyScope, status: 'active' } }),
    prisma.agentJob.count({ where: { ...companyScope, status: 'queued' } }),
    prisma.agentJob.count({ where: { ...companyScope, status: { in: ['claimed', 'running'] } } }),
    prisma.agentFinding.count({ where: { ...companyScope, status: 'new' } }),
    prisma.agentNotification.count({ where: notificationWhere }),
    prisma.agentJob.count({
      where: {
        ...companyScope,
        status: 'failed',
        OR: [
          { finishedAt: { gte: since24h } },
          { finishedAt: null, updatedAt: { gte: since24h } },
        ],
      },
    }),
    prisma.agentSource.count({
      where: {
        ...companyScope,
        OR: [{ status: 'error' }, { lastError: { not: null } }],
      },
    }),
    prisma.agentSource.findMany({
      where: companyScope,
      orderBy: [{ lastScannedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 8,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        lastScannedAt: true,
        nextScanAt: true,
        lastError: true,
        checkpoint: true,
      },
    }),
  ]);

  const recentSourceScans = recentSources.map(source => {
    const checkpoint = (source.checkpoint || {}) as Record<string, unknown>;
    const scanStats = (
      (checkpoint.lastScanMetrics && typeof checkpoint.lastScanMetrics === 'object'
        ? checkpoint.lastScanMetrics
        : checkpoint.scanStats) || {}
    ) as Record<string, unknown>;
    const postsNewRaw = scanStats.newPostsInserted ?? scanStats.postsNew;
    const postsNew = Number.isFinite(Number(postsNewRaw)) ? Number(postsNewRaw) : null;
    const findingsRaw = scanStats.findingsCreated ?? scanStats.findings;
    const findings = Number.isFinite(Number(findingsRaw)) ? Number(findingsRaw) : null;
    const stoppedReason = checkpoint.lastStopReason
      ? String(checkpoint.lastStopReason)
      : scanStats.stoppedReason
        ? String(scanStats.stoppedReason)
        : scanStats.stopReason
          ? String(scanStats.stopReason)
          : null;
    return {
      id: source.id,
      name: source.name,
      type: source.type,
      status: source.status,
      lastScannedAt: source.lastScannedAt?.toISOString() ?? null,
      nextScanAt: source.nextScanAt?.toISOString() ?? null,
      lastError: source.lastError,
      postsNew,
      findings,
      stoppedReason,
    };
  });

  const postsNewLastScans = recentSourceScans.reduce(
    (sum, item) => sum + (item.postsNew ?? 0),
    0,
  );

  return {
    activeSources,
    queuedJobs,
    runningJobs,
    newFindings,
    unreadNotifications,
    jobsFailed24h,
    sourcesWithError,
    postsNewLastScans,
    recentSourceScans,
  };
}

export async function listAgentSources(
  user: AuthUser,
  pagination: PaginationInput,
  filters: { status?: string; type?: string; search?: string },
) {
  const companyScope = buildCompanyScopeFilter(user);
  const where: Prisma.AgentSourceWhereInput = {
    ...companyScope,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { url: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.agentSource.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.agentSource.count({ where }),
  ]);

  return { items, total };
}

export async function getAgentSourceById(id: string) {
  return prisma.agentSource.findUnique({ where: { id } });
}

export async function createAgentSource(data: Prisma.AgentSourceCreateInput) {
  return prisma.agentSource.create({ data });
}

export async function updateAgentSource(id: string, data: Prisma.AgentSourceUpdateInput) {
  return prisma.agentSource.update({ where: { id }, data });
}

export class AgentSourceRemovedError extends Error {
  constructor(sourceId: string, reason: 'missing' | 'inactive' = 'missing') {
    const detail =
      reason === 'inactive'
        ? 'nguồn không còn active (đã pause hoặc xóa)'
        : 'nguồn đã bị xóa';
    super(`SOURCE_REMOVED: ${detail} (${sourceId}).`);
    this.name = 'AgentSourceRemovedError';
  }
}

/** Worker/scan loop — abort when CMS deleted or paused the source mid-job. */
export async function assertAgentSourceActiveForScan(sourceId: string) {
  const source = await prisma.agentSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new AgentSourceRemovedError(sourceId, 'missing');
  if (source.status !== 'active') throw new AgentSourceRemovedError(sourceId, 'inactive');
  return source;
}

export async function countSourceDependencies(sourceId: string) {
  const [jobs, scannedContents, findings] = await Promise.all([
    prisma.agentJob.count({ where: { sourceId } }),
    prisma.scannedContent.count({ where: { sourceId } }),
    prisma.agentFinding.count({ where: { sourceId } }),
  ]);
  return jobs + scannedContents + findings;
}

export async function cancelQueuedJobsForSource(sourceId: string) {
  return prisma.agentJob.deleteMany({
    where: { sourceId, status: 'queued' },
  });
}

/** @deprecated UI delete always hard-deletes; use forceDeleteAgentSource or pause via PATCH. */
export async function deleteOrPauseAgentSource(id: string) {
  const deps = await countSourceDependencies(id);
  if (deps > 0) {
    const paused = await prisma.agentSource.update({
      where: { id },
      data: { status: 'paused' },
    });
    return { record: paused, softPaused: true as const };
  }
  const deleted = await prisma.agentSource.delete({ where: { id } });
  return { record: deleted, softPaused: false as const };
}

/**
 * Hard-delete a source and ALL its dependent rows (findings -> action proposals
 * cascade, scanned contents, jobs). Notifications keep referencing findings via
 * SetNull. Runs in a transaction so it is all-or-nothing.
 */
export async function forceDeleteAgentSource(id: string) {
  return prisma.$transaction(async tx => {
    const findings = await tx.agentFinding.deleteMany({ where: { sourceId: id } });
    const contents = await tx.scannedContent.deleteMany({ where: { sourceId: id } });
    const jobs = await tx.agentJob.deleteMany({ where: { sourceId: id } });
    const record = await tx.agentSource.delete({ where: { id } });
    return {
      record,
      softPaused: false as const,
      deleted: {
        findings: findings.count,
        scannedContents: contents.count,
        jobs: jobs.count,
      },
    };
  });
}

export async function getAgentJobById(id: string) {
  return prisma.agentJob.findUnique({ where: { id } });
}

export async function deleteAgentJob(id: string) {
  return prisma.agentJob.delete({ where: { id } });
}

/**
 * Bulk-delete jobs by terminal status (default: completed + failed).
 * Never touches running/claimed jobs.
 */
export async function deleteAgentJobsByStatus(input: {
  companyId?: string | null;
  sourceId?: string;
  statuses?: string[];
}) {
  const statuses = input.statuses?.length ? input.statuses : ['completed', 'failed'];
  const result = await prisma.agentJob.deleteMany({
    where: {
      status: { in: statuses },
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
    },
  });
  return result.count;
}

export async function listAgentMissions(user: AuthUser, pagination: PaginationInput, status?: string) {
  const companyScope = buildCompanyScopeFilter(user);
  const where: Prisma.AgentMissionWhereInput = {
    ...companyScope,
    ...(status ? { status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.agentMission.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.agentMission.count({ where }),
  ]);

  const { enrichMissionListItem } = await import(
    '../modules/mission-engine/application/missionRunDetailService'
  );
  const enriched = await Promise.all(
    items.map(async m => ({
      ...m,
      scheduler: await enrichMissionListItem(m.id),
    })),
  );

  return { items: enriched, total };
}

export async function getAgentMissionById(id: string) {
  return prisma.agentMission.findUnique({ where: { id } });
}

export async function createAgentMission(data: Prisma.AgentMissionCreateInput) {
  return prisma.agentMission.create({ data });
}

export async function updateAgentMission(id: string, data: Prisma.AgentMissionUpdateInput) {
  return prisma.agentMission.update({ where: { id }, data });
}

export async function listAgentJobs(
  user: AuthUser,
  pagination: PaginationInput,
  filters: { status?: string; type?: string; sourceId?: string; missionId?: string },
) {
  const companyScope = buildCompanyScopeFilter(user);
  const where: Prisma.AgentJobWhereInput = {
    ...companyScope,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
    ...(filters.missionId ? { missionId: filters.missionId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.agentJob.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { availableAt: 'asc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: { source: { select: { id: true, name: true, type: true } }, mission: { select: { id: true, name: true } } },
    }),
    prisma.agentJob.count({ where }),
  ]);

  return { items, total };
}

export type AgentFindingListFilters = {
  minScore?: number;
  maxScore?: number;
  status?: string;
  type?: string;
  sourceId?: string;
  classification?: string | string[];
  intent?: string;
  actorRole?: string;
  priority?: string;
  hasPhone?: boolean;
  hasBudget?: boolean;
  location?: string;
  propertyType?: string;
  dedupeStatus?: string;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
  /** Default false: hide seller/landlord/broker unless true */
  includeSupplySignals?: boolean;
  /** Default false: hide dismissed */
  includeDismissed?: boolean;
  /** Include consumed findings (promoted / external / dismissed) */
  includeConsumed?: boolean;
  /** Quick filter: processed | inbox | needs_review */
  quickFilter?: string;
  /** Quick filter: unknown / null classification or actorRole */
  needsReview?: boolean;
  /** Filter by dismiss reason (e.g. out_of_domain) */
  dismissReason?: string;
  promoted?: boolean;
  externalInventorySaved?: boolean;
  /** Include manually approved findings even when demand-only filters apply */
  includeManualApproved?: boolean;
  scoreStatus?: string;
};

const DEFAULT_LEAD_CLASSIFICATIONS = ['buyer', 'renter', 'investor'];

export async function listAgentFindings(
  user: AuthUser,
  pagination: PaginationInput,
  filters: AgentFindingListFilters = {},
) {
  const companyScope = buildCompanyScopeFilter(user);
  const where = buildFindingWhere(companyScope, filters);

  const [items, total] = await Promise.all([
    prisma.agentFinding.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { finalScore: 'desc' }, { priority: 'asc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        source: { select: { id: true, name: true, type: true } },
        mission: { select: { id: true, name: true } },
        scannedContent: {
          select: {
            id: true,
            canonicalUrl: true,
            authorName: true,
            authorUrl: true,
            contentText: true,
            publishedAt: true,
            collectedAt: true,
          },
        },
      },
    }),
    prisma.agentFinding.count({ where }),
  ]);

  return { items: items.map(enrichFindingForApi), total };
}

function enrichFindingForApi<T extends Record<string, any>>(row: T): T & {
  resolved?: ReturnType<typeof resolveLeadIntelligence>;
  intelligence?: ReturnType<typeof resolveLeadIntelligence>;
  intelligenceSummary?: ReturnType<typeof toLeadIntelligenceListDTO>;
} {
  const serialized = serializeFindingRow(row);
  const resolved = resolveLeadIntelligence(serialized);
  const intelligenceSummary = toLeadIntelligenceListDTO(resolved, {
    status: serialized.status,
    findingId: serialized.id,
  });
  return {
    ...serialized,
    classification: resolved.classification ?? serialized.classification ?? null,
    intent: resolved.intent ?? serialized.intent ?? null,
    actorRole: resolved.actorRole ?? serialized.actorRole ?? null,
    finalScore: resolved.finalScore,
    scoreStatus: resolved.scoreStatus,
    summary: resolved.summary || serialized.summary,
    needSummary: resolved.demand.needSummary,
    personName:
      resolved.person.name === 'Chưa xác định'
        ? serialized.personName ?? null
        : resolved.person.name,
    primaryPhone: resolved.primaryPhone ?? serialized.primaryPhone ?? null,
    primaryLocation: resolved.primaryLocation ?? serialized.primaryLocation ?? null,
    analysisStatus: resolved.analysisStatus,
    consistencyWarnings: resolved.consistencyWarnings,
    /** @deprecated Prefer `intelligence` — same object */
    resolved,
    intelligence: resolved,
    intelligenceSummary,
  };
}

function buildFindingWhere(
  companyScope: Prisma.AgentFindingWhereInput,
  filters: AgentFindingListFilters,
): Prisma.AgentFindingWhereInput {
  const classifications = normalizeStringList(filters.classification);
  const and: Prisma.AgentFindingWhereInput[] = [];
  const quick = String(filters.quickFilter || '').trim().toLowerCase();
  const isProcessedQuick =
    quick === 'processed' || filters.status === 'processed';

  if (isProcessedQuick) {
    and.push({
      status: {
        in: ['promoted_to_investor_lead', 'saved_to_external_inventory', 'promoted'],
      },
    });
  } else if (!filters.includeDismissed && !filters.includeConsumed && !filters.status) {
    // Default inbox: new + not consumed
    and.push({ status: 'new' });
    and.push({
      OR: [{ consumptionType: null }, { consumptionType: 'none' }],
    });
    and.push({ promotedLeadId: null });
    and.push({ externalInventoryItemId: null });
  } else if (!filters.includeDismissed && !filters.status && !filters.includeConsumed) {
    and.push({ status: 'new' });
  }

  // Default Lead Intelligence: demand-side only — never include null/unknown/seller
  if (filters.needsReview) {
    and.push({
      OR: [
        { classification: null },
        { classification: 'unknown' },
        { actorRole: null },
        { actorRole: 'unknown' },
      ],
    });
  } else if (filters.dismissReason) {
    and.push({ dismissReason: filters.dismissReason });
  } else if (!filters.includeSupplySignals && classifications.length === 0 && !filters.actorRole) {
    if (filters.includeManualApproved) {
      and.push({
        OR: [
          {
            AND: [
              { classification: { in: DEFAULT_LEAD_CLASSIFICATIONS } },
              { actorRole: 'demand_side' },
              { dedupeStatus: 'unique' },
            ],
          },
          { scoreStatus: 'manual_approved', dedupeStatus: 'unique' },
        ],
      });
    } else {
      and.push({ classification: { in: DEFAULT_LEAD_CLASSIFICATIONS } });
      and.push({ actorRole: 'demand_side' });
      and.push({ dedupeStatus: 'unique' });
    }
  } else if (!filters.includeSupplySignals && classifications.length === 0) {
    and.push({ classification: { in: DEFAULT_LEAD_CLASSIFICATIONS } });
  }

  if (classifications.length === 1) {
    if (filters.includeManualApproved) {
      and.push({
        OR: [
          { classification: classifications[0] },
          { scoreStatus: 'manual_approved' },
        ],
      });
    } else {
      and.push({ classification: classifications[0] });
    }
  } else if (classifications.length > 1) {
    if (filters.includeManualApproved) {
      and.push({
        OR: [
          { classification: { in: classifications } },
          { scoreStatus: 'manual_approved' },
        ],
      });
    } else {
      and.push({ classification: { in: classifications } });
    }
  }

  if (filters.actorRole) {
    if (filters.includeManualApproved) {
      and.push({
        OR: [{ actorRole: filters.actorRole }, { scoreStatus: 'manual_approved' }],
      });
    } else {
      and.push({ actorRole: filters.actorRole });
    }
  }

  if (filters.dedupeStatus) {
    const statuses = normalizeStringList(filters.dedupeStatus);
    if (statuses.length === 1) and.push({ dedupeStatus: statuses[0] });
    else if (statuses.length > 1) and.push({ dedupeStatus: { in: statuses } });
  }

  if (filters.hasPhone === true) {
    and.push({ primaryPhone: { not: null } });
  }
  if (filters.hasBudget === true) {
    and.push({
      OR: [{ budgetMin: { not: null } }, { budgetMax: { not: null } }],
    });
  }
  if (filters.location) {
    and.push({
      primaryLocation: { contains: filters.location, mode: 'insensitive' },
    });
  }
  if (filters.propertyType) {
    and.push({
      propertyType: { contains: filters.propertyType, mode: 'insensitive' },
    });
  }
  if (filters.search) {
    and.push({
      OR: [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { summary: { contains: filters.search, mode: 'insensitive' } },
        { needSummary: { contains: filters.search, mode: 'insensitive' } },
        { personName: { contains: filters.search, mode: 'insensitive' } },
        { primaryPhone: { contains: filters.search } },
        { primaryLocation: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }
  if (filters.promoted === true) {
    and.push({ promotedLeadId: { not: null } });
  } else if (filters.promoted === false) {
    and.push({ promotedLeadId: null });
  }
  if (filters.externalInventorySaved === true) {
    and.push({ externalInventoryItemId: { not: null } });
  }
  if (filters.scoreStatus) {
    and.push({ scoreStatus: filters.scoreStatus });
  }
  if (filters.createdFrom || filters.createdTo) {
    and.push({
      createdAt: {
        ...(filters.createdFrom ? { gte: new Date(filters.createdFrom) } : {}),
        ...(filters.createdTo ? { lte: new Date(filters.createdTo) } : {}),
      },
    });
  }

  // Score filter uses finalScore only (not legacy score)
  const scoreFilter: Prisma.IntFilter = {};
  if (filters.minScore !== undefined) scoreFilter.gte = filters.minScore;
  if (filters.maxScore !== undefined) scoreFilter.lte = filters.maxScore;

  const statusFilter =
    isProcessedQuick || filters.status === 'processed'
      ? undefined
      : filters.status
        ? { status: filters.status }
        : {};

  return {
    ...companyScope,
    ...statusFilter,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
    ...(filters.intent ? { intent: filters.intent } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(Object.keys(scoreFilter).length ? { finalScore: scoreFilter } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

function normalizeStringList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(raw.map(v => String(v).trim().toLowerCase()).filter(Boolean))];
}

function serializeFindingRow<T extends Record<string, any>>(row: T): T {
  const out: Record<string, any> = { ...row };
  for (const key of ['budgetMin', 'budgetMax', 'askingPrice']) {
    const val = out[key];
    if (typeof val === 'bigint') out[key] = val.toString();
  }
  return out as T;
}

export async function getAgentFindingById(id: string) {
  const row = await prisma.agentFinding.findUnique({
    where: { id },
    include: {
      source: { select: { id: true, name: true, type: true } },
      mission: { select: { id: true, name: true } },
      scannedContent: true,
    },
  });
  return row ? enrichFindingForApi(row) : null;
}

export async function updateAgentFinding(
  id: string,
  data: {
    status: string;
    promotedLeadId?: string | null;
    dismissReason?: string | null;
    dismissNote?: string | null;
    dismissedBy?: string | null;
    reviewedBy?: string | null;
  },
) {
  const isDismiss = data.status === 'dismissed';
  const isReviewed = data.status === 'reviewed';
  const row = await prisma.agentFinding.update({
    where: { id },
    data: {
      status: data.status,
      ...(data.promotedLeadId !== undefined ? { promotedLeadId: data.promotedLeadId } : {}),
      ...(isDismiss
        ? {
            dismissedAt: new Date(),
            dismissedBy: data.dismissedBy ?? null,
            dismissReason: data.dismissReason ?? null,
            dismissNote: data.dismissNote ?? null,
          }
        : {}),
      ...(isReviewed
        ? {
            reviewedAt: new Date(),
            reviewedBy: data.reviewedBy ?? null,
          }
        : {}),
    },
  });
  return serializeFindingRow(row);
}

const BULK_ACTION_MAX = 500;

export async function bulkActionAgentFindings(input: {
  user: AuthUser;
  action: 'reviewed' | 'dismissed' | 'reanalyze';
  findingIds: string[];
  reason?: string | null;
  note?: string | null;
}): Promise<{
  requested: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ id: string; message: string }>;
}> {
  const ids = [...new Set(input.findingIds.map(id => String(id).trim()).filter(Boolean))].slice(
    0,
    BULK_ACTION_MAX,
  );
  const companyScope = buildCompanyScopeFilter(input.user);
  const errors: Array<{ id: string; message: string }> = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      const existing = await prisma.agentFinding.findFirst({
        where: { id, ...companyScope },
        select: { id: true, status: true, companyId: true },
      });
      if (!existing) {
        skipped += 1;
        errors.push({ id, message: 'Not found or out of tenant scope' });
        continue;
      }

      if (input.action === 'reviewed') {
        await prisma.agentFinding.update({
          where: { id },
          data: {
            status: 'reviewed',
            reviewedAt: new Date(),
            reviewedBy: input.user.id,
          },
        });
        updated += 1;
      } else if (input.action === 'dismissed') {
        await prisma.agentFinding.update({
          where: { id },
          data: {
            status: 'dismissed',
            dismissedAt: new Date(),
            dismissedBy: input.user.id,
            dismissReason: input.reason ?? 'bulk_dismiss',
            dismissNote: input.note ?? null,
          },
        });
        updated += 1;
      } else if (input.action === 'reanalyze') {
        // Mark for worker reprocess — keep content, reset status lightly
        await prisma.agentFinding.update({
          where: { id },
          data: {
            status: existing.status === 'dismissed' ? 'dismissed' : 'new',
            intelligenceVersion: 'pending-reanalyze',
          },
        });
        updated += 1;
      }
    } catch (error) {
      failed += 1;
      errors.push({
        id,
        message: error instanceof Error ? error.message : 'update failed',
      });
    }
  }

  return {
    requested: ids.length,
    updated,
    skipped,
    failed,
    errors: errors.slice(0, 50),
  };
}

export async function listAgentNotifications(
  user: AuthUser,
  pagination: PaginationInput,
  filters: { status?: string },
) {
  const companyScope = buildCompanyScopeFilter(user);
  const where: Prisma.AgentNotificationWhereInput = {
    ...companyScope,
    ...(filters.status ? { status: filters.status } : {}),
    ...(user.role === 'member' ? { OR: [{ userId: user.id }, { userId: null }] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.agentNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: { finding: { select: { id: true, title: true, score: true, status: true } } },
    }),
    prisma.agentNotification.count({ where }),
  ]);

  return { items, total };
}

export async function getAgentNotificationById(id: string) {
  return prisma.agentNotification.findUnique({ where: { id } });
}

export async function markNotificationRead(id: string) {
  return prisma.agentNotification.update({
    where: { id },
    data: { status: 'read', readAt: new Date() },
  });
}

export async function countUnreadAgentNotifications(user: AuthUser): Promise<number> {
  const companyScope = buildCompanyScopeFilter(user);
  const where: Prisma.AgentNotificationWhereInput = {
    ...companyScope,
    status: 'unread',
    ...(user.role === 'member' ? { OR: [{ userId: user.id }, { userId: null }] } : {}),
  };
  return prisma.agentNotification.count({ where });
}

export async function markAllAgentNotificationsRead(user: AuthUser): Promise<number> {
  const companyScope = buildCompanyScopeFilter(user);
  const where: Prisma.AgentNotificationWhereInput = {
    ...companyScope,
    status: 'unread',
    ...(user.role === 'member' ? { OR: [{ userId: user.id }, { userId: null }] } : {}),
  };
  const result = await prisma.agentNotification.updateMany({
    where,
    data: { status: 'read', readAt: new Date() },
  });
  return result.count;
}

export async function listBrowserSessions(
  user: AuthUser,
  pagination: PaginationInput,
  filters: { status?: string },
) {
  const companyScope = buildCompanyScopeFilter(user);
  const where: Prisma.BrowserSessionWhereInput = {
    ...companyScope,
    ...(filters.status ? { status: filters.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.browserSession.findMany({
      where,
      orderBy: [{ status: 'asc' }, { lastHeartbeatAt: 'desc' }, { updatedAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.browserSession.count({ where }),
  ]);

  return { items, total };
}

export async function listScannedContents(
  user: AuthUser,
  pagination: PaginationInput,
  filters: { sourceId?: string; status?: string; search?: string },
) {
  const companyScope = buildCompanyScopeFilter(user);
  const where: Prisma.ScannedContentWhereInput = {
    ...companyScope,
    ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
    ...(filters.status
      ? { status: filters.status }
      : {
          // Default "Tất cả": hide archived so "Xóa khỏi danh sách" sticks after reload
          status: { not: 'archived' },
        }),
    ...(filters.search
      ? {
          OR: [
            { contentText: { contains: filters.search, mode: 'insensitive' } },
            { authorName: { contains: filters.search, mode: 'insensitive' } },
            { canonicalUrl: { contains: filters.search, mode: 'insensitive' } },
            { externalId: { contains: filters.search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.scannedContent.findMany({
      where,
      orderBy: [{ collectedAt: 'desc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        source: { select: { id: true, name: true, type: true } },
        findings: { select: { id: true, score: true, status: true, type: true } },
      },
    }),
    prisma.scannedContent.count({ where }),
  ]);

  return { items, total };
}

export async function getScannedContentById(id: string) {
  return prisma.scannedContent.findUnique({
    where: { id },
    include: {
      source: { select: { id: true, name: true, type: true } },
      findings: { select: { id: true, score: true, status: true, type: true, promotedLeadId: true } },
    },
  });
}

export async function updateScannedContentStatus(input: {
  id: string;
  status: string;
  user: AuthUser;
}): Promise<{ id: string; status: string }> {
  const existing = await prisma.scannedContent.findUnique({ where: { id: input.id } });
  if (!existing) throw new Error('Không tìm thấy nội dung quét.');
  if (!canAccessAgentRecord(input.user, existing.companyId)) {
    throw new Error('Không có quyền.');
  }
  const updated = await prisma.scannedContent.update({
    where: { id: existing.id },
    data: { status: input.status },
  });
  return { id: updated.id, status: updated.status };
}

export async function hardDeleteScannedContent(input: {
  id: string;
  user: AuthUser;
  confirm?: boolean;
}): Promise<{ id: string; deleted: boolean }> {
  if (input.user.role !== 'owner') {
    throw new Error('Chỉ owner được hard-delete nội dung quét.');
  }
  if (!input.confirm) {
    throw new Error('Cần confirm=true để xóa vĩnh viễn.');
  }
  const existing = await prisma.scannedContent.findUnique({
    where: { id: input.id },
    include: { findings: { select: { id: true } } },
  });
  if (!existing) throw new Error('Không tìm thấy nội dung quét.');

  // Cascade: remove linked findings first so orphaned content can be purged.
  if (existing.findings.length > 0) {
    await prisma.agentFinding.deleteMany({ where: { scannedContentId: existing.id } });
  }
  await prisma.scannedContent.delete({ where: { id: existing.id } });
  return { id: existing.id, deleted: true };
}

export async function reanalyzeScannedContent(input: {
  id: string;
  user: AuthUser;
}): Promise<{ id: string; status: string; findingsReset: number }> {
  const existing = await prisma.scannedContent.findUnique({ where: { id: input.id } });
  if (!existing) throw new Error('Không tìm thấy nội dung quét.');
  if (!canAccessAgentRecord(input.user, existing.companyId)) {
    throw new Error('Không có quyền.');
  }
  const updated = await prisma.scannedContent.update({
    where: { id: existing.id },
    data: { status: 'pending_reanalyze' },
  });
  const reset = await prisma.agentFinding.updateMany({
    where: {
      scannedContentId: existing.id,
      status: { in: ['new', 'reviewed'] },
      OR: [{ consumptionType: null }, { consumptionType: 'none' }],
    },
    data: {
      intelligenceVersion: 'pending-reanalyze',
      status: 'new',
    },
  });
  return { id: updated.id, status: updated.status, findingsReset: reset.count };
}

export async function resolveMissionSourceIds(
  mission: { companyId: string | null; rules: unknown },
  companyId: string,
): Promise<string[]> {
  const rules = (mission.rules || {}) as MissionRules;
  const explicit = Array.isArray(rules.sourceIds)
    ? rules.sourceIds.map(id => String(id).trim()).filter(Boolean)
    : [];

  const where: Prisma.AgentSourceWhereInput = {
    status: 'active',
    ...(mission.companyId ? { companyId: mission.companyId } : { companyId }),
  };

  if (explicit.length > 0) {
    where.id = { in: explicit };
  }

  const sources = await prisma.agentSource.findMany({
    where,
    select: { id: true },
    orderBy: { priority: 'asc' },
  });

  return sources.map(source => source.id);
}
