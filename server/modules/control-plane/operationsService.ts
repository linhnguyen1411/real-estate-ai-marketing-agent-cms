/**
 * Control Plane Operations API — used by Command Engine.
 * Telegram never calls this with Prisma; commands go through here.
 */

import { enqueueMissionRun } from '../../agent/agentJobService';
import { buildAutomationRuntimeSnapshot } from '../../agent/runtimeObservability';
import { prisma } from '../../prisma';
import type { AuthUser } from '../../../src/types';
import { getAgentById, listRegisteredAgents } from './agentRegistry';
import { emitRuntimeEvent } from './runtimeEventBus';
import { buildControlPlaneReport } from './reportEngine';
import type { ControlPlaneReportKind } from './types';

export type OpsJobRow = {
  id: string;
  type: string;
  status: string;
  missionId: string | null;
  missionRunId: string | null;
  claimedBy: string | null;
  attempts: number;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
};

function durationMs(startedAt: Date | null, finishedAt: Date | null, updatedAt: Date): number | null {
  if (!startedAt) return null;
  const endMs = (finishedAt || updatedAt).getTime();
  return Math.max(0, endMs - startedAt.getTime());
}

export async function opsGetDashboard(user: AuthUser) {
  const snap = await buildAutomationRuntimeSnapshot(user);
  const agents = await listRegisteredAgents({
    companyId: user.role === 'owner' ? undefined : user.company_id ?? undefined,
  });
  const online = agents.filter(a => a.status === 'online' || a.status === 'degraded');
  const browserMeta = snap.workers
    .map(w => w.runtime?.browserPool)
    .filter(Boolean);
  const execMeta = snap.workers
    .map(w => w.runtime?.executionPool)
    .filter(Boolean);

  return {
    healthScore: snap.healthScore,
    health: snap.health,
    agentsOnline: online.length,
    agentsTotal: agents.length,
    queue: snap.queue,
    missions: snap.missions,
    metrics: snap.metrics,
    browserPools: browserMeta,
    executionPools: execMeta,
    activeJobs: snap.activeJobs.length,
    generatedAt: snap.generatedAt,
  };
}

export async function opsListAgentJobs(input: {
  companyId?: string | null;
  status?: 'running' | 'pending' | 'failed' | 'completed' | 'all';
  limit?: number;
}): Promise<OpsJobRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 15, 1), 50);
  const status = input.status || 'all';
  const statusFilter =
    status === 'running'
      ? { status: { in: ['running', 'claimed'] } }
      : status === 'pending'
        ? { status: { in: ['queued'] } }
        : status === 'failed'
          ? { status: 'failed' }
          : status === 'completed'
            ? { status: 'completed' }
            : {
                status: {
                  in: ['queued', 'claimed', 'running', 'failed', 'completed', 'cancelled'],
                },
              };

  const rows = await prisma.agentJob.findMany({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...statusFilter,
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      missionId: true,
      missionRunId: true,
      claimedBy: true,
      attempts: true,
      errorMessage: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map(j => ({
    id: j.id,
    type: j.type,
    status: j.status,
    missionId: j.missionId,
    missionRunId: j.missionRunId,
    claimedBy: j.claimedBy,
    attempts: j.attempts,
    errorMessage: j.errorMessage,
    durationMs: durationMs(j.startedAt, j.finishedAt, j.updatedAt),
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  }));
}

async function resolveMission(idOrName: string) {
  const byId = await prisma.agentMission.findUnique({ where: { id: idOrName } });
  if (byId) return byId;
  return prisma.agentMission.findFirst({
    where: { name: { equals: idOrName, mode: 'insensitive' } },
  });
}

export async function opsGetMission(idOrName: string) {
  const mission = await resolveMission(idOrName);
  if (!mission) return null;
  const runs = await prisma.agentMissionRun.findMany({
    where: { missionId: mission.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      error: true,
    },
  });
  return { mission, runs };
}

export async function opsPauseMission(idOrName: string) {
  const mission = await resolveMission(idOrName);
  if (!mission) throw new Error(`Mission not found: ${idOrName}`);
  return prisma.agentMission.update({
    where: { id: mission.id },
    data: { status: 'paused' },
  });
}

export async function opsResumeMission(idOrName: string) {
  const mission = await resolveMission(idOrName);
  if (!mission) throw new Error(`Mission not found: ${idOrName}`);
  return prisma.agentMission.update({
    where: { id: mission.id },
    data: { status: 'active' },
  });
}

export async function opsCancelMission(
  idOrName: string,
  actor: string,
): Promise<{ missionId?: string; missionRunId?: string; jobsCancelled: number }> {
  const asRun = await prisma.agentMissionRun.findUnique({ where: { id: idOrName } });
  if (asRun) {
    await prisma.agentMissionRun.update({
      where: { id: asRun.id },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
        error: `Cancelled via Control Plane (${actor})`,
      },
    });
    const res = await prisma.agentJob.updateMany({
      where: {
        missionRunId: asRun.id,
        status: { in: ['queued', 'claimed', 'running'] },
      },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        errorMessage: `Cancelled via Control Plane (${actor})`,
      },
    });
    return { missionRunId: asRun.id, jobsCancelled: res.count };
  }

  const mission = await resolveMission(idOrName);
  if (!mission) throw new Error(`Mission / run not found: ${idOrName}`);
  const runs = await prisma.agentMissionRun.findMany({
    where: { missionId: mission.id, status: { in: ['queued', 'running'] } },
    select: { id: true },
  });
  let jobs = 0;
  for (const r of runs) {
    await prisma.agentMissionRun.update({
      where: { id: r.id },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
        error: `Cancelled via Control Plane (${actor})`,
      },
    });
    const res = await prisma.agentJob.updateMany({
      where: {
        missionRunId: r.id,
        status: { in: ['queued', 'claimed', 'running'] },
      },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        errorMessage: `Cancelled via Control Plane (${actor})`,
      },
    });
    jobs += res.count;
  }
  return { missionId: mission.id, jobsCancelled: jobs };
}

export async function opsRetryMission(
  idOrName: string,
  input: { companyId?: string | null; triggeredBy: string },
) {
  const mission = await resolveMission(idOrName);
  if (!mission) throw new Error(`Mission not found: ${idOrName}`);
  return enqueueMissionRun({
    missionId: mission.id,
    companyId: mission.companyId || input.companyId || 'comp-da-nang',
    triggeredByUserId: input.triggeredBy,
  });
}

export async function opsListPublishQueue(input: {
  companyId?: string | null;
  limit?: number;
}) {
  const { listJobs } = await import('../social-publishing/jobService');
  return listJobs({
    companyId: input.companyId,
    status: 'queued',
    limit: input.limit ?? 20,
  });
}

export async function opsRetryPublish(id: string, actor?: string | null) {
  const { retryJob } = await import('../social-publishing/jobService');
  return retryJob(id, actor);
}

export async function opsCancelPublish(id: string, actor?: string | null) {
  const { cancelJob } = await import('../social-publishing/jobService');
  return cancelJob(id, actor);
}

export async function opsRetryScan(
  idOrName: string,
  input: { companyId?: string | null; triggeredBy: string },
) {
  // Prefer mission retry; if id looks like source, enqueue scan via mission path when possible
  return opsRetryMission(idOrName, input);
}

export async function opsRetryCampaign(idOrName: string, triggeredBy: string) {
  const byId = await prisma.socialCampaign.findUnique({ where: { id: idOrName } });
  const campaign =
    byId ||
    (await prisma.socialCampaign.findFirst({
      where: { name: { equals: idOrName, mode: 'insensitive' } },
    }));
  if (!campaign) throw new Error(`Campaign not found: ${idOrName}`);
  const { startCampaignRun } = await import('../social-publishing/campaignService');
  return startCampaignRun({
    campaignId: campaign.id,
    triggeredBy,
    triggerType: 'manual',
    enqueueNow: true,
  });
}

export async function opsGetAgent(agentId: string) {
  return getAgentById(agentId);
}

/** Soft restart request — Event Bus only (no SSH). */
export async function opsRequestAgentRestart(agentId: string, companyId?: string | null) {
  const agent = await getAgentById(agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  await emitRuntimeEvent({
    type: 'OPS_REQUEST',
    companyId: companyId ?? agent.companyId,
    agentId: agent.agentId,
    entityType: 'agent',
    entityId: agent.agentId,
    payload: { action: 'restart', requestedAt: new Date().toISOString() },
  });
  return { agentId: agent.agentId, requested: true };
}

export async function opsBrowserStatus(user: AuthUser) {
  const snap = await buildAutomationRuntimeSnapshot(user);
  return {
    workers: snap.workers.map(w => ({
      workerId: w.workerId,
      online: w.online,
      browserPool: w.runtime?.browserPool ?? null,
      currentUrl: w.currentUrl,
      lastError: w.lastError,
    })),
    healthBrowser: snap.health.browser,
  };
}

export async function opsBrowserCommand(
  action: 'release' | 'recover' | 'screenshot',
  companyId?: string | null,
) {
  await emitRuntimeEvent({
    type: 'OPS_REQUEST',
    companyId: companyId ?? null,
    entityType: 'browser',
    entityId: action,
    payload: { action: `browser_${action}`, requestedAt: new Date().toISOString() },
  });
  return { action, requested: true };
}

export async function opsReport(
  user: AuthUser,
  kind: ControlPlaneReportKind,
  options?: { date?: string },
) {
  return buildControlPlaneReport(user, kind, options);
}

/** Soft lead ops — Control Plane only (Telegram never touches DB). */
export async function opsLeadSkip(findingId: string, triggeredBy: string) {
  const finding = await prisma.agentFinding.findUnique({ where: { id: findingId } });
  if (!finding) throw new Error(`Finding not found: ${findingId}`);
  await prisma.agentFinding.update({
    where: { id: findingId },
    data: { status: 'dismissed' },
  });
  await emitRuntimeEvent({
    type: 'OPS_REQUEST',
    companyId: finding.companyId,
    entityType: 'finding',
    entityId: findingId,
    payload: { action: 'lead_skip', triggeredBy, requestedAt: new Date().toISOString() },
  });
  return { findingId, status: 'dismissed' as const };
}

export async function opsLeadCreateMission(findingId: string, triggeredBy: string) {
  const finding = await prisma.agentFinding.findUnique({ where: { id: findingId } });
  if (!finding) throw new Error(`Finding not found: ${findingId}`);
  await emitRuntimeEvent({
    type: 'OPS_REQUEST',
    companyId: finding.companyId,
    entityType: 'finding',
    entityId: findingId,
    payload: {
      action: 'lead_create_mission',
      triggeredBy,
      requestedAt: new Date().toISOString(),
    },
  });
  return { findingId, requested: true as const };
}

export async function opsLeadRetryNotify(findingId: string) {
  const { notifyFindingIfEligible } = await import(
    '../../notifications/telegramNotificationService'
  );
  return notifyFindingIfEligible({ findingId, force: true });
}
