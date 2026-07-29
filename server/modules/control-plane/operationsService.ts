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
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function durationMs(startedAt: Date | null, finishedAt: Date | null, updatedAt: Date): number | null {
  if (!startedAt) return null;
  const endMs = (finishedAt || updatedAt).getTime();
  return Math.max(0, endMs - startedAt.getTime());
}

export async function opsGetDashboard(user: AuthUser) {
  const companyId = user.role === 'owner' ? null : user.company_id ?? null;
  const { refreshOperationsMetrics } = await import('./operations');
  const operations = await refreshOperationsMetrics({
    companyId,
    reason: 'dashboard',
  });
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
    healthScore: operations.fleet.healthScore || snap.healthScore,
    health: snap.health,
    agentsOnline: operations.fleet.machinesOnline || online.length,
    agentsTotal: operations.machines.length || agents.length,
    queue: snap.queue,
    missions: snap.missions,
    metrics: snap.metrics,
    browserPools: browserMeta,
    executionPools: execMeta,
    activeJobs: snap.activeJobs.length,
    generatedAt: operations.generatedAt || snap.generatedAt,
    operations,
  };
}

/** Operations Center metrics — prefer cache; force refresh when requested. */
export async function opsGetOperationsMetrics(input?: {
  companyId?: string | null;
  refresh?: boolean;
  reason?:
    | 'manual'
    | 'dashboard'
    | 'report'
    | 'telegram'
    | 'interval_5m'
    | 'job_complete'
    | 'mission_complete'
    | 'publish_complete';
}) {
  const {
    getLastOperationsMetrics,
    refreshOperationsMetrics,
  } = await import('./operations');
  if (input?.refresh || !getLastOperationsMetrics(input?.companyId)) {
    return refreshOperationsMetrics({
      companyId: input?.companyId,
      reason: input?.reason || 'manual',
    });
  }
  return getLastOperationsMetrics(input?.companyId)!;
}

export async function opsScheduleAgent(input: {
  companyId?: string | null;
  require?: Array<'scan' | 'publish' | 'messaging' | 'comment' | 'browser' | 'cdp'>;
  requireTags?: string[];
  preferTags?: string[];
  preferredAgentId?: string | null;
  preferredHostname?: string | null;
  requireBrowserFree?: boolean;
  priority?: number;
}) {
  const { listFleetAgents, scheduleFleetAgent } = await import('./fleet');
  const agents = await listFleetAgents({ companyId: input.companyId });
  const pick = scheduleFleetAgent(agents, {
    require: input.require,
    requireTags: input.requireTags,
    preferTags: input.preferTags,
    preferredAgentId: input.preferredAgentId,
    preferredHostname: input.preferredHostname,
    requireBrowserFree: input.requireBrowserFree,
    priority: input.priority,
  });
  return {
    agentId: pick?.agentId ?? null,
    hostname: pick?.hostname ?? null,
    machineId: pick?.machineId ?? null,
    activity: pick?.activity ?? null,
    scorePreview: pick
      ? {
          jobsRunning: pick.jobs.running,
          cpuLoad1m: pick.cpuLoad1m,
          tags: pick.tags,
          capabilities: pick.capabilities,
        }
      : null,
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
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
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
  status?: string;
}) {
  const { listJobs } = await import('../social-publishing/jobService');
  return listJobs({
    companyId: input.companyId,
    status: input.status || 'queued',
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

/** Soft restart request — Event Bus + heartbeat OPS delivery (no SSH). */
export async function opsRequestAgentRestart(agentId: string, companyId?: string | null) {
  const agent = await getAgentById(agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  const { requestRemoteControl } = await import('./telemetry');
  await requestRemoteControl({
    agentId: agent.agentId,
    action: 'restart_agent',
    companyId: companyId ?? agent.companyId,
  });
  await emitRuntimeEvent({
    type: 'AGENT_RESTART',
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
  const { listAgentSnapshots, getLastAgentSnapshot } = await import('./telemetry');
  return {
    workers: snap.workers.map(w => ({
      workerId: w.workerId,
      online: w.online,
      browserPool: w.runtime?.browserPool ?? null,
      currentUrl: w.currentUrl,
      lastError: w.lastError,
      telemetry: w.workerId ? getLastAgentSnapshot(w.workerId) : null,
    })),
    healthBrowser: snap.health.browser,
    snapshots: listAgentSnapshots(),
  };
}

export async function opsBrowserCommand(
  action:
    | 'release'
    | 'recover'
    | 'screenshot'
    | 'profiles'
    | 'restart'
    | 'force'
    | 'takeover',
  companyId?: string | null,
  agentId?: string | null,
) {
  const { requestRemoteControl, listAgentSnapshots } = await import('./telemetry');
  if (action === 'profiles') {
    const { listBrowserOwnership, formatBrowserOwnershipLines } = await import(
      './browser-ownership'
    );
    const ownership = listBrowserOwnership();
    return {
      action,
      profiles: listAgentSnapshots().flatMap(s =>
        s.browserProfiles.map(p => ({ agentId: s.agentId, ...p })),
      ),
      ownership,
      lines: formatBrowserOwnershipLines(ownership),
    };
  }

  const mapped =
    action === 'release'
      ? 'release_browser'
      : action === 'force'
        ? 'force_release_browser'
        : action === 'takeover'
          ? 'takeover_browser'
          : action === 'recover'
            ? 'recover_browser'
            : action === 'restart'
              ? 'restart_browser'
              : 'refresh_runtime';

  const target =
    agentId ||
    (await listRegisteredAgents({ companyId: companyId ?? undefined, onlineOnly: true }))[0]
      ?.agentId;

  if (target) {
    await requestRemoteControl({
      agentId: target,
      action: mapped,
      companyId,
    });
  } else {
    await emitRuntimeEvent({
      type: 'OPS_REQUEST',
      companyId: companyId ?? null,
      entityType: 'browser',
      entityId: action,
      payload: { action: `browser_${action}`, requestedAt: new Date().toISOString() },
    });
  }
  return { action, requested: true, agentId: target || null };
}

export async function opsRefreshRuntime(agentId?: string | null, companyId?: string | null) {
  const { requestRemoteControl } = await import('./telemetry');
  const { refreshOperationsMetrics } = await import('./operations');
  const target =
    agentId ||
    (await listRegisteredAgents({ companyId: companyId ?? undefined, onlineOnly: true }))[0]
      ?.agentId;
  if (target) {
    await requestRemoteControl({
      agentId: target,
      action: 'refresh_runtime',
      companyId,
    });
  }
  const operations = await refreshOperationsMetrics({
    companyId,
    reason: 'manual',
  });
  return { agentId: target || null, requested: Boolean(target), operations };
}

export async function opsGetAgentTelemetry(agentId: string) {
  const { getFleetAgent } = await import('./fleet');
  const fleet = await getFleetAgent(agentId);
  if (!fleet) {
    const agent = await getAgentById(agentId);
    if (!agent) return null;
    return { agent, snapshot: null, fleet: null };
  }
  return {
    agent: {
      agentId: fleet.agentId,
      hostname: fleet.hostname,
      version: fleet.version,
      capabilities: fleet.capabilities,
      status: fleet.status,
      heartbeatAt: fleet.lastHeartbeat,
      heartbeatAgeMs: fleet.heartbeatAgeMs,
      companyId: fleet.companyId,
      sessionId: fleet.sessionId,
      workerId: fleet.workerId,
      executionSlots: [],
      browserPool: fleet.browserProfiles,
      metrics: {
        pid: null,
        rssMb: fleet.rssMb,
        heapUsedMb: fleet.heapUsedMb,
        uptimeSec: fleet.uptimeSec,
        slotUtilization: null,
        browserUtilization: null,
      },
      currentUrl: fleet.currentUrl,
      lastError: fleet.lastError,
    },
    snapshot: fleet.snapshot,
    fleet,
  };
}

export async function opsGetFleet(companyId?: string | null) {
  const { getFleetState, listFleetBrowsers } = await import('./fleet');
  const { getOrchestratorSnapshot } = await import('./fleet-orchestrator');
  const state = await getFleetState({ companyId });
  const orchestrator = getOrchestratorSnapshot();
  return {
    state,
    browsers: listFleetBrowsers(state.agents),
    orchestrator,
  };
}

export async function opsFleetPolicy(input: {
  action: 'drain' | 'maintenance' | 'policy' | 'pin' | 'status';
  machineId?: string | null;
  agentId?: string | null;
  hostname?: string | null;
  mode?: string | null;
  enable?: boolean;
  missionId?: string | null;
  sourceId?: string | null;
}) {
  const orch = await import('./fleet-orchestrator');
  if (input.action === 'status') {
    return orch.getOrchestratorSnapshot();
  }
  if (input.action === 'policy' && input.mode) {
    orch.setFleetPolicyMode(input.mode as import('./fleet-orchestrator').FleetPolicyMode);
    return orch.getOrchestratorSnapshot();
  }
  const machineId = input.machineId || input.agentId || input.hostname || 'unknown';
  if (input.action === 'drain') {
    return orch.setAgentDrain({
      machineId,
      agentId: input.agentId,
      hostname: input.hostname,
      drain: input.enable !== false,
    });
  }
  if (input.action === 'maintenance') {
    return orch.setAgentMaintenance({
      machineId,
      agentId: input.agentId,
      hostname: input.hostname,
      maintenance: input.enable !== false,
    });
  }
  if (input.action === 'pin') {
    return orch.pinToMachine({
      machineId,
      agentId: input.agentId,
      hostname: input.hostname,
      missionId: input.missionId,
      sourceId: input.sourceId,
    });
  }
  return orch.getOrchestratorSnapshot();
}

export async function opsGetFleetAgent(idOrMachine: string) {
  const { getFleetAgent } = await import('./fleet');
  return getFleetAgent(idOrMachine);
}

export async function opsListFleetJobs(input: {
  companyId?: string | null;
  status?: 'running' | 'pending' | 'failed' | 'completed' | 'all';
  limit?: number;
}) {
  const { listFleetAgents } = await import('./fleet');
  const jobs = await opsListAgentJobs(input);
  const agents = await listFleetAgents({ companyId: input.companyId });
  const byId = new Map(agents.map(a => [a.agentId, a]));
  for (const a of agents) {
    if (a.workerId) byId.set(a.workerId, a);
  }
  return jobs.map(j => {
    const agent = j.claimedBy ? byId.get(j.claimedBy) : undefined;
    return {
      jobId: j.id,
      type: j.type,
      status: j.status,
      claimedBy: j.claimedBy,
      machineId: agent?.machineId || null,
      hostname: agent?.hostname || null,
      startedAt: j.startedAt,
      durationMs: j.durationMs,
      missionId: j.missionId,
    };
  });
}

export async function opsReport(
  user: AuthUser,
  kind: ControlPlaneReportKind,
  options?: { date?: string },
) {
  const companyId = user.role === 'owner' ? null : user.company_id ?? null;
  const { refreshOperationsMetrics } = await import('./operations');
  await refreshOperationsMetrics({ companyId, reason: 'report' }).catch(() => null);
  return buildControlPlaneReport(user, kind, options);
}

/** Soft lead ops — Control Plane only (Telegram never touches DB). */

/** Resolve full finding id from exact id or unique prefix (callback trunc). */
export async function resolveFindingId(idOrPrefix: string): Promise<string> {
  const raw = String(idOrPrefix || '').trim();
  if (!raw) throw new Error('Missing finding id');
  const exact = await prisma.agentFinding.findUnique({
    where: { id: raw },
    select: { id: true },
  });
  if (exact) return exact.id;
  if (raw.length < 8) throw new Error(`Finding not found: ${raw}`);
  const matches = await prisma.agentFinding.findMany({
    where: { id: { startsWith: raw } },
    select: { id: true },
    take: 2,
  });
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) throw new Error(`Ambiguous finding id prefix: ${raw}`);
  throw new Error(`Finding not found: ${raw}`);
}

async function listAssignableOwners(companyId: string | null | undefined) {
  const users = await prisma.user.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      role: { in: ['company', 'owner', 'admin', 'sales', 'agent'] },
    },
    select: { id: true, email: true, data: true, role: true },
    take: 12,
    orderBy: { createdAt: 'asc' },
  });
  return users.map(u => {
    const data =
      u.data && typeof u.data === 'object' && !Array.isArray(u.data)
        ? (u.data as Record<string, unknown>)
        : {};
    const name =
      (typeof data.name === 'string' && data.name) ||
      (typeof data.fullName === 'string' && data.fullName) ||
      u.email.split('@')[0] ||
      u.id.slice(0, 8);
    return { id: u.id, label: String(name).slice(0, 40) };
  });
}

export async function opsLeadSkip(
  findingId: string,
  triggeredBy: string,
  ignoreReason?: string,
) {
  const id = await resolveFindingId(findingId);
  const existing = await prisma.agentFinding.findUnique({
    where: { id },
    select: { id: true, status: true, companyId: true },
  });
  if (!existing) throw new Error(`Finding not found: ${id}`);
  if (existing.status === 'dismissed') {
    return { findingId: id, status: 'dismissed' as const, idempotent: true, spamRulesCreated: 0 };
  }

  const reason = ignoreReason || 'spam';
  const { recordSalesAction } = await import('../sales-layer');
  await recordSalesAction({
    findingId: id,
    action: 'ignore',
    actor: triggeredBy,
    result: `dismissed_via_telegram:${reason}`,
  }).catch(async () => {
    await prisma.agentFinding.update({
      where: { id },
      data: {
        status: 'dismissed',
        dismissedAt: new Date(),
        dismissedBy: triggeredBy,
        dismissReason: reason,
      },
    });
  });

  let spamRulesCreated = 0;
  try {
    const { learnFromIgnoredFinding } = await import('../sales-layer/ignoreLearnService');
    const result = await learnFromIgnoredFinding({
      findingId: id,
      reason: reason as import('../sales-layer/ignoreLearnService').IgnoreReason,
      actor: triggeredBy,
    });
    spamRulesCreated = result.rulesCreated;
  } catch {
    /* non-critical: learning failure should not block ignore */
  }

  await emitRuntimeEvent({
    type: 'OPS_REQUEST',
    companyId: existing.companyId ?? null,
    entityType: 'finding',
    entityId: id,
    payload: {
      action: 'lead_skip',
      triggeredBy,
      ignoreReason: reason,
      spamRulesCreated,
      requestedAt: new Date().toISOString(),
    },
  });
  return { findingId: id, status: 'dismissed' as const, idempotent: false, spamRulesCreated };
}

export async function opsLeadCreateMission(findingId: string, triggeredBy: string) {
  const id = await resolveFindingId(findingId);
  const finding = await prisma.agentFinding.findUnique({ where: { id } });
  if (!finding) throw new Error(`Finding not found: ${id}`);
  await emitRuntimeEvent({
    type: 'OPS_REQUEST',
    companyId: finding.companyId,
    entityType: 'finding',
    entityId: id,
    payload: {
      action: 'lead_create_mission',
      triggeredBy,
      requestedAt: new Date().toISOString(),
    },
  });
  return { findingId: id, requested: true as const };
}

export async function opsLeadRetryNotify(findingId: string) {
  const id = await resolveFindingId(findingId);
  const { notifyFindingIfEligible } = await import(
    '../../notifications/telegramNotificationService'
  );
  return notifyFindingIfEligible({ findingId: id, force: true });
}

/** Assign — show owner picker (does not auto-assign to telegram user). */
export async function opsLeadAssign(findingId: string, triggeredBy: string) {
  const id = await resolveFindingId(findingId);
  const finding = await prisma.agentFinding.findUnique({
    where: { id },
    select: { id: true, companyId: true, personName: true, title: true },
  });
  if (!finding) throw new Error(`Finding not found: ${id}`);

  const { assignOwnerKeyboard } = await import('../sales-layer');
  let owners = await listAssignableOwners(finding.companyId);
  if (!owners.length) {
    owners = [{ id: 'self', label: triggeredBy.slice(0, 40) || 'Self' }];
  }
  const lines = [
    '👥 ASSIGN',
    `Lead · ${finding.personName || finding.title.slice(0, 40)}`,
    'Chọn sales owner:',
  ];
  return {
    findingId: id,
    lines,
    replyMarkup: assignOwnerKeyboard({ findingId: id, owners }),
    owners,
  };
}

/** Persist owner after picker selection. */
export async function opsLeadAssignOwner(
  findingId: string,
  ownerId: string,
  triggeredBy: string,
) {
  const id = await resolveFindingId(findingId);
  const finding = await prisma.agentFinding.findUnique({
    where: { id },
    select: { id: true, companyId: true },
  });
  if (!finding) throw new Error(`Finding not found: ${id}`);

  let ownerLabel = ownerId;
  if (ownerId !== 'self') {
    const owner = await prisma.user.findFirst({
      where: {
        OR: [{ id: ownerId }, { id: { startsWith: ownerId } }],
        ...(finding.companyId ? { companyId: finding.companyId } : {}),
      },
      select: { id: true, email: true, data: true },
    });
    if (owner) {
      const data =
        owner.data && typeof owner.data === 'object' && !Array.isArray(owner.data)
          ? (owner.data as Record<string, unknown>)
          : {};
      ownerLabel =
        (typeof data.name === 'string' && data.name) ||
        owner.email.split('@')[0] ||
        owner.id;
      ownerId = owner.id;
    }
  } else {
    ownerLabel = triggeredBy;
    ownerId = triggeredBy;
  }

  const { updateLeadPipelineStage, processLeadAcquisition } = await import(
    '../lead-acquisition'
  );
  const { recordSalesAction, readSalesProfile } = await import('../sales-layer');
  await processLeadAcquisition({ findingId: id, notifyTelegram: false }).catch(() => null);

  const before = await prisma.agentFinding.findUnique({
    where: { id },
    select: { extractedData: true },
  });
  const existing = before ? readSalesProfile(before.extractedData) : null;
  if (existing?.owner === ownerLabel || existing?.owner === ownerId) {
    return {
      findingId: id,
      owner: existing.owner,
      lines: [`👥 Lead đã giao cho ${existing.owner}.`, '(idempotent)'],
      idempotent: true,
    };
  }

  await updateLeadPipelineStage({
    findingId: id,
    stage: 'assigned',
    actor: triggeredBy,
  }).catch(() => null);

  await recordSalesAction({
    findingId: id,
    action: 'assign',
    actor: triggeredBy,
    owner: ownerLabel,
    result: `assigned:${ownerId}`,
  });

  return {
    findingId: id,
    owner: ownerLabel,
    lines: [`👥 Đã giao lead cho ${ownerLabel}.`],
    idempotent: false,
  };
}

/** H3 — Mark for CRM */
export async function opsLeadCrm(findingId: string, triggeredBy: string) {
  const id = await resolveFindingId(findingId);
  const { updateLeadPipelineStage, processLeadAcquisition } = await import(
    '../lead-acquisition'
  );
  const { recordSalesAction } = await import('../sales-layer');
  await processLeadAcquisition({ findingId: id, notifyTelegram: false }).catch(() => null);
  const profile = await updateLeadPipelineStage({
    findingId: id,
    stage: 'interested',
    actor: triggeredBy,
  });
  if (!profile) throw new Error(`Finding not found: ${id}`);
  await recordSalesAction({
    findingId: id,
    action: 'contact',
    actor: triggeredBy,
    result: 'crm_flag',
  }).catch(() => null);
  return { findingId: id, stage: 'interested' as const, profile };
}

/** Sales Action Card — Call (callback fallback when no tel: URL). */
export async function opsLeadCall(findingId: string, triggeredBy: string) {
  const id = await resolveFindingId(findingId);
  const { recordSalesAction, toTelUri } = await import('../sales-layer');
  const finding = await prisma.agentFinding.findUnique({
    where: { id },
    select: { id: true, primaryPhone: true, personName: true },
  });
  if (!finding) throw new Error(`Finding not found: ${id}`);
  if (!finding.primaryPhone) {
    return {
      findingId: id,
      profile: null,
      phone: null,
      lines: ['📞 Không có số điện thoại của lead.'],
    };
  }
  const profile = await recordSalesAction({
    findingId: id,
    action: 'call',
    actor: triggeredBy,
    result: `phone:${finding.primaryPhone}`,
  });
  const tel = toTelUri(finding.primaryPhone);
  const lines = [
    `📞 Call · ${finding.personName || id.slice(0, 10)}`,
    `Phone · ${finding.primaryPhone}`,
    tel ? `Mở máy gọi: ${tel}` : null,
    profile ? `Pipeline · ${profile.pipelineStage}` : null,
  ].filter(Boolean) as string[];
  return { findingId: id, profile, lines, phone: finding.primaryPhone, telUri: tel };
}

/** Sales Action Card — Contact / inbox */
export async function opsLeadContact(findingId: string, triggeredBy: string) {
  const id = await resolveFindingId(findingId);
  const { recordSalesAction, readSalesProfile } = await import('../sales-layer');
  const finding = await prisma.agentFinding.findUnique({
    where: { id },
    select: {
      id: true,
      primaryPhone: true,
      personName: true,
      extractedData: true,
      scannedContent: { select: { canonicalUrl: true } },
    },
  });
  if (!finding) throw new Error(`Finding not found: ${id}`);

  const existing = readSalesProfile(finding.extractedData);
  const last = existing?.timeline?.[existing.timeline.length - 1];
  if (last?.kind === 'contact' && last.actor === triggeredBy) {
    const ageMs = Date.now() - Date.parse(last.at);
    if (Number.isFinite(ageMs) && ageMs < 60_000) {
      return {
        findingId: id,
        profile: existing,
        lines: ['💬 Đã ghi nhận: Contact lead.', '(idempotent — vừa contact)'],
        idempotent: true,
      };
    }
  }

  const profile = await recordSalesAction({
    findingId: id,
    action: 'contact',
    actor: triggeredBy,
    result: finding.scannedContent?.canonicalUrl || 'contact_initiated',
  });
  const lines = [
    '💬 Đã ghi nhận: Contact lead.',
    finding.primaryPhone ? `Phone · ${finding.primaryPhone}` : null,
    finding.scannedContent?.canonicalUrl
      ? `Source · ${finding.scannedContent.canonicalUrl}`
      : null,
    profile ? `Pipeline · ${profile.pipelineStage}` : null,
  ].filter(Boolean) as string[];
  return { findingId: id, profile, lines, idempotent: false };
}

/** Open Lead Center deep link / metadata */
export async function opsLeadOpen(findingId: string, triggeredBy: string) {
  const id = await resolveFindingId(findingId);
  const { recordSalesAction, buildLeadCenterUrl } = await import('../sales-layer');
  const finding = await prisma.agentFinding.findUnique({ where: { id } });
  if (!finding) throw new Error(`Finding not found: ${id}`);
  await recordSalesAction({
    findingId: id,
    action: 'open',
    actor: triggeredBy,
    result: 'open_lead_center',
  }).catch(() => null);
  const url = buildLeadCenterUrl(id);
  const lines = [
    `👤 Open Lead · ${finding.personName || finding.title.slice(0, 40)}`,
    url || 'Lead Center URL chưa cấu hình (PUBLIC_SITE_URL)',
  ];
  return { findingId: id, url, lines };
}

/** Source metadata + openable permalink button when available */
export async function opsLeadSource(findingId: string, triggeredBy: string) {
  const id = await resolveFindingId(findingId);
  const {
    recordSalesAction,
    resolveSourceProvenance,
    isTrustedContentUrl,
  } = await import('../sales-layer');
  const { isSolidFacebookPermalink, isDegradedFacebookUrl, toMobileFriendlyFacebookUrl } =
    await import('../link-normalization');
  const finding = await prisma.agentFinding.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      scannedContent: { select: { canonicalUrl: true } },
      source: { select: { name: true, type: true } },
      extractedData: true,
    },
  });
  if (!finding) throw new Error(`Finding not found: ${id}`);
  const prov = resolveSourceProvenance({
    extractedData: finding.extractedData,
    agentSourceName: finding.source?.name,
    agentSourceType: finding.source?.type,
    canonicalUrl: finding.scannedContent?.canonicalUrl || null,
  });

  const candidates = [prov.url, finding.scannedContent?.canonicalUrl];
  const openUrl =
    candidates
      .map(u => (u ? toMobileFriendlyFacebookUrl(u) || u : null))
      .find(
        u =>
          u &&
          !isDegradedFacebookUrl(u) &&
          isSolidFacebookPermalink(u) &&
          isTrustedContentUrl(u, {
            agentSourceName: finding.source?.name,
            platform: prov.platform,
          }),
      ) || null;

  await recordSalesAction({
    findingId: id,
    action: 'source',
    actor: triggeredBy,
    result: openUrl || prov.url || prov.name || 'no_url',
  }).catch(() => null);

  const lines = [
    `🔗 Source · ${prov.label || 'Không rõ nguồn'}`,
    openUrl ? `URL · ${openUrl}` : '🔗 Không có permalink bài viết nguồn.',
  ];

  const replyMarkup = openUrl
    ? { inline_keyboard: [[{ text: '🔗 Mở bài gốc', url: openUrl }]] }
    : undefined;

  return { findingId: id, url: openUrl, lines, replyMarkup };
}

/** H3.5 — Buyer journey / timeline history */
export async function opsLeadHistory(findingId: string) {
  const id = await resolveFindingId(findingId);
  const { processSalesLayer, readSalesProfile } = await import('../sales-layer');
  const finding = await prisma.agentFinding.findUnique({ where: { id } });
  if (!finding) throw new Error(`Finding not found: ${id}`);
  let profile = readSalesProfile(finding.extractedData);
  if (!profile) {
    profile = await processSalesLayer({ findingId: id, notifyFollowUp: false });
  }
  if (!profile) {
    return {
      findingId: id,
      profile: null,
      lines: ['📜 Chưa có lịch sử sales.'],
    };
  }
  const stagePath = [
    ...new Set([
      ...profile.stageHistory.map(h => h.to),
      profile.pipelineStage,
    ]),
  ];
  const lines = [
    '📜 HISTORY',
    stagePath.length ? stagePath.join(' → ') : `Pipeline · ${profile.pipelineStage}`,
    `Journey · ${profile.journeyStage}`,
    `Owner · ${profile.owner || '—'}`,
    '',
  ];
  if (!profile.timeline.length) {
    lines.push('📜 Chưa có lịch sử sales.');
  } else {
    lines.push(
      ...profile.timeline.slice(-8).map(e => `• ${e.at.slice(0, 10)} · ${e.label}`),
    );
  }
  return { findingId: id, profile, lines };
}
