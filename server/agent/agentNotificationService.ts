import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export const AGENT_NOTIFICATION_TYPES = [
  'finding_high_score',
  'job_failed',
  'browser_needs_login',
  'scan_hot_leads',
  'scan_summary',
  'session_heartbeat_lost',
] as const;

export type AgentNotificationType = (typeof AGENT_NOTIFICATION_TYPES)[number];

export type AgentNotificationSeverity = 'info' | 'warning' | 'high' | 'error' | 'critical';

export type AgentNotificationLinkTarget =
  | { kind: 'finding'; findingId: string }
  | { kind: 'job'; jobId: string }
  | { kind: 'session'; sessionId?: string; workerId?: string }
  | { kind: 'source'; sourceId: string }
  | { kind: 'notifications' };

export interface CreateAgentNotificationInput {
  companyId?: string | null;
  userId?: string | null;
  findingId?: string | null;
  type: AgentNotificationType | string;
  eventKey: string;
  title: string;
  message: string;
  severity?: AgentNotificationSeverity | string;
  data?: Record<string, unknown> | null;
  link?: AgentNotificationLinkTarget;
}

export interface CreateAgentNotificationResult {
  created: boolean;
  id?: string;
}

/**
 * Single entry point for AgentNotification inserts.
 * Deduplicates via unique (companyId, eventKey) — P2002 → created:false.
 */
export async function createAgentNotification(
  input: CreateAgentNotificationInput,
): Promise<CreateAgentNotificationResult> {
  const eventKey = String(input.eventKey || '').trim();
  if (!eventKey) {
    console.warn('[agent-notify] Missing eventKey — skip');
    return { created: false };
  }

  const dataPayload: Record<string, unknown> = {
    ...(input.data || {}),
    ...(input.link ? { link: input.link } : {}),
  };

  try {
    const row = await prisma.agentNotification.create({
      data: {
        companyId: input.companyId ?? null,
        userId: input.userId ?? null,
        findingId: input.findingId ?? null,
        type: input.type,
        eventKey,
        title: input.title.slice(0, 200),
        message: input.message.slice(0, 4000),
        severity: input.severity || 'info',
        status: 'unread',
        data: Object.keys(dataPayload).length
          ? (dataPayload as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    return { created: true, id: row.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { created: false };
    }
    console.warn('[agent-notify] create failed:', error instanceof Error ? error.message : error);
    return { created: false };
  }
}

export async function notifyFindingHighScore(input: {
  companyId: string | null;
  findingId: string;
  score: number;
  title: string;
  canonicalUrl?: string;
  sourceId?: string;
}): Promise<CreateAgentNotificationResult> {
  return createAgentNotification({
    companyId: input.companyId,
    findingId: input.findingId,
    type: 'finding_high_score',
    eventKey: `finding:${input.findingId}`,
    title: `Finding mới — điểm ${input.score}`,
    message: `${input.title}${input.canonicalUrl ? ` (${input.canonicalUrl})` : ''}`,
    severity: input.score >= 90 ? 'high' : 'info',
    data: {
      score: input.score,
      sourceId: input.sourceId,
    },
    link: { kind: 'finding', findingId: input.findingId },
  });
}

export async function notifyJobFailed(input: {
  companyId: string | null;
  jobId: string;
  jobType: string;
  sourceId?: string | null;
  errorMessage?: string | null;
  attempts: number;
}): Promise<CreateAgentNotificationResult> {
  return createAgentNotification({
    companyId: input.companyId,
    type: 'job_failed',
    eventKey: `job-failed:${input.jobId}`,
    title: `Job thất bại: ${input.jobType}`,
    message: input.errorMessage?.slice(0, 500) || `Job ${input.jobId} hết retry (${input.attempts} lần).`,
    severity: 'error',
    data: {
      jobId: input.jobId,
      jobType: input.jobType,
      sourceId: input.sourceId,
      attempts: input.attempts,
    },
    link: { kind: 'job', jobId: input.jobId },
  });
}

export async function notifyBrowserNeedsLogin(input: {
  companyId: string | null;
  workerId: string;
  sourceId?: string;
  sourceName?: string;
  kind?: string | null;
  reason: string;
  sessionId?: string;
}): Promise<CreateAgentNotificationResult> {
  return createAgentNotification({
    companyId: input.companyId,
    type: 'browser_needs_login',
    eventKey: `fb-auth:${input.workerId}:${input.kind ?? 'unknown'}`,
    title: 'Browser cần đăng nhập lại',
    message: `${input.sourceName || 'Worker'}: ${input.reason}`,
    severity: 'high',
    data: {
      sourceId: input.sourceId,
      workerId: input.workerId,
      kind: input.kind,
      sessionId: input.sessionId,
    },
    link: { kind: 'session', sessionId: input.sessionId, workerId: input.workerId },
  });
}

/** Scan finished with hot leads (findings above notify threshold). */
export async function notifyScanHotLeads(input: {
  companyId: string | null;
  sourceId: string;
  sourceName: string;
  findings: number;
  postsNew: number;
  dayKey?: string;
}): Promise<CreateAgentNotificationResult> {
  if (input.findings <= 0) return { created: false };
  const day = input.dayKey || new Date().toISOString().slice(0, 10);
  return createAgentNotification({
    companyId: input.companyId,
    type: 'scan_hot_leads',
    eventKey: `scan-hot:${input.sourceId}:${day}`,
    title: `Lead nóng từ ${input.sourceName}`,
    message: `${input.findings} finding · ${input.postsNew} bài mới trong lần quét.`,
    severity: 'high',
    data: {
      sourceId: input.sourceId,
      findings: input.findings,
      postsNew: input.postsNew,
    },
    link: { kind: 'source', sourceId: input.sourceId },
  });
}

export async function notifyScanSummary(input: {
  companyId: string | null;
  sourceId: string;
  sourceName: string;
  postsNew: number;
  duplicates: number;
  findings: number;
  stoppedReason: string;
}): Promise<CreateAgentNotificationResult> {
  const day = new Date().toISOString().slice(0, 10);
  return createAgentNotification({
    companyId: input.companyId,
    type: 'scan_summary',
    eventKey: `fb-scan-summary:${input.sourceId}:${day}:${input.stoppedReason}`,
    title: `Quét xong: ${input.sourceName}`,
    message: [
      `Mới ${input.postsNew}`,
      `trùng ${input.duplicates}`,
      `finding ${input.findings}`,
      `dừng: ${input.stoppedReason}`,
    ].join(' · '),
    severity: 'info',
    data: {
      sourceId: input.sourceId,
      postsNew: input.postsNew,
      duplicates: input.duplicates,
      findings: input.findings,
      stoppedReason: input.stoppedReason,
    },
    link: { kind: 'source', sourceId: input.sourceId },
  });
}

export async function notifySessionHeartbeatLost(input: {
  companyId: string | null;
  sessionId: string;
  workerId: string | null;
  name: string;
  lastHeartbeatAt: Date | null;
}): Promise<CreateAgentNotificationResult> {
  const hourKey = new Date().toISOString().slice(0, 13);
  return createAgentNotification({
    companyId: input.companyId,
    type: 'session_heartbeat_lost',
    eventKey: `session-stale:${input.sessionId}:${hourKey}`,
    title: 'Browser session mất heartbeat',
    message: `${input.name} (${input.workerId || 'no-worker'}) — heartbeat cuối: ${
      input.lastHeartbeatAt?.toISOString() || 'không có'
    }`,
    severity: 'warning',
    data: {
      sessionId: input.sessionId,
      workerId: input.workerId,
    },
    link: { kind: 'session', sessionId: input.sessionId, workerId: input.workerId || undefined },
  });
}

/** Mark sessions with stale heartbeat as offline + notify (called from scheduler). */
export async function checkStaleBrowserSessions(options?: {
  staleMs?: number;
}): Promise<{ checked: number; notified: number }> {
  const staleMs = options?.staleMs ?? 90_000;
  const cutoff = new Date(Date.now() - staleMs);

  const stale = await prisma.browserSession.findMany({
    where: {
      status: { in: ['online', 'running', 'ready', 'starting'] },
      OR: [
        { lastHeartbeatAt: { lt: cutoff } },
        { lastHeartbeatAt: null, updatedAt: { lt: cutoff } },
      ],
    },
    take: 20,
  });

  let notified = 0;
  for (const session of stale) {
    await prisma.browserSession.update({
      where: { id: session.id },
      data: {
        status: 'offline',
        lastError: session.lastError || 'Heartbeat timeout',
      },
    });
    const result = await notifySessionHeartbeatLost({
      companyId: session.companyId,
      sessionId: session.id,
      workerId: session.workerId,
      name: session.name,
      lastHeartbeatAt: session.lastHeartbeatAt,
    });
    if (result.created) notified += 1;
  }

  return { checked: stale.length, notified };
}

export function resolveNotificationHref(data: unknown): string {
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const link = (payload.link && typeof payload.link === 'object'
    ? payload.link
    : null) as Record<string, unknown> | null;

  const kind = String(link?.kind || '');
  if (kind === 'finding' && link?.findingId) {
    return `/admin/agents/findings`;
  }
  if (kind === 'job' && link?.jobId) {
    return `/admin/agents/jobs`;
  }
  if (kind === 'session') {
    return `/admin/agents/sessions`;
  }
  if (kind === 'source' && link?.sourceId) {
    return `/admin/agents/sources`;
  }

  // Fallbacks from legacy data shapes
  if (payload.findingId || payload.score !== undefined) return '/admin/agents/findings';
  if (payload.jobId) return '/admin/agents/jobs';
  if (payload.workerId || payload.sessionId) return '/admin/agents/sessions';
  if (payload.sourceId) return '/admin/agents/sources';
  return '/admin/agents/notifications';
}
