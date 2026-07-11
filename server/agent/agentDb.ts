import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../src/types';
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

export async function countSourceDependencies(sourceId: string) {
  const [jobs, scannedContents, findings] = await Promise.all([
    prisma.agentJob.count({ where: { sourceId } }),
    prisma.scannedContent.count({ where: { sourceId } }),
    prisma.agentFinding.count({ where: { sourceId } }),
  ]);
  return jobs + scannedContents + findings;
}

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

  return { items, total };
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

export async function listAgentFindings(
  user: AuthUser,
  pagination: PaginationInput,
  filters: { minScore?: number; status?: string; type?: string; sourceId?: string },
) {
  const companyScope = buildCompanyScopeFilter(user);
  const where: Prisma.AgentFindingWhereInput = {
    ...companyScope,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
    ...(filters.minScore !== undefined ? { score: { gte: filters.minScore } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.agentFinding.findMany({
      where,
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        source: { select: { id: true, name: true, type: true } },
        mission: { select: { id: true, name: true } },
        scannedContent: { select: { id: true, canonicalUrl: true, authorName: true, collectedAt: true } },
      },
    }),
    prisma.agentFinding.count({ where }),
  ]);

  return { items, total };
}

export async function getAgentFindingById(id: string) {
  return prisma.agentFinding.findUnique({
    where: { id },
    include: {
      source: { select: { id: true, name: true, type: true } },
      mission: { select: { id: true, name: true } },
      scannedContent: true,
    },
  });
}

export async function updateAgentFinding(
  id: string,
  data: { status: string; promotedLeadId?: string | null },
) {
  return prisma.agentFinding.update({
    where: { id },
    data: {
      status: data.status,
      ...(data.promotedLeadId !== undefined ? { promotedLeadId: data.promotedLeadId } : {}),
    },
  });
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
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { contentText: { contains: filters.search, mode: 'insensitive' } },
            { authorName: { contains: filters.search, mode: 'insensitive' } },
            { canonicalUrl: { contains: filters.search, mode: 'insensitive' } },
            { externalId: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.scannedContent.findMany({
      where,
      orderBy: { collectedAt: 'desc' },
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
