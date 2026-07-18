/**
 * Control Plane — Runtime Agent service (CMS side).
 * Wraps existing claim/complete/heartbeat DB ops for Execution Agents over HTTP.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import {
  claimNextJob,
  completeJob,
  reclaimOrphanedAgentJobs,
  releaseJobToQueue,
  requeueRunningJob,
} from '../../agent-worker/jobClaimer';
import { emitRuntimeEventAsync } from './runtimeEventBus';
import { buildAgentRegistryMetadata } from './agentRegistry';

export async function runtimeAgentRegister(input: {
  agentId: string;
  hostname?: string;
  version?: string;
  capabilities?: string[];
  companyId?: string | null;
  metadata?: Record<string, unknown>;
  profilePath?: string;
  sessionName?: string;
}) {
  const agentId = input.agentId.trim();
  if (!agentId) throw new Error('agentId required');

  const registryMeta = buildAgentRegistryMetadata({
    workerId: agentId,
    browserMode: String(input.metadata?.mode || 'managed'),
    capabilities: (input.capabilities as never) ?? ['scan', 'publish', 'browser'],
    version: input.version,
  });

  const metadata = {
    ...registryMeta,
    ...(input.hostname ? { hostname: input.hostname } : {}),
    ...(input.metadata || {}),
    capabilities: input.capabilities ?? registryMeta.capabilities,
    executionAgent: true,
  };

  const existing = await prisma.browserSession.findFirst({
    where: { workerId: agentId },
    orderBy: { updatedAt: 'desc' },
  });

  const data = {
    name: input.sessionName || `Execution Agent (${agentId})`,
    workerId: agentId,
    profilePath: input.profilePath || 'execution-agent',
    companyId: input.companyId ?? null,
    status: 'ready' as const,
    lastHeartbeatAt: new Date(),
    lastError: null as string | null,
    metadata: metadata as Prisma.InputJsonValue,
  };

  const session = existing
    ? await prisma.browserSession.update({ where: { id: existing.id }, data })
    : await prisma.browserSession.create({ data });

  emitRuntimeEventAsync({
    type: 'AGENT_ONLINE',
    agentId,
    companyId: input.companyId ?? null,
    entityType: 'agent',
    entityId: agentId,
    payload: { sessionId: session.id, hostname: input.hostname },
  });

  return {
    sessionId: session.id,
    agentId,
    status: session.status,
    lastHeartbeatAt: session.lastHeartbeatAt,
  };
}

export async function runtimeAgentHeartbeat(input: {
  agentId: string;
  sessionId?: string;
  status?: string;
  currentUrl?: string | null;
  metadata?: Record<string, unknown>;
  lastError?: string | null;
}) {
  const agentId = input.agentId.trim();
  const session =
    (input.sessionId
      ? await prisma.browserSession.findUnique({ where: { id: input.sessionId } })
      : null) ||
    (await prisma.browserSession.findFirst({
      where: { workerId: agentId },
      orderBy: { updatedAt: 'desc' },
    }));

  if (!session) throw new Error(`Agent session not found for ${agentId}`);

  const prevMeta =
    session.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata)
      ? (session.metadata as Record<string, unknown>)
      : {};

  const updated = await prisma.browserSession.update({
    where: { id: session.id },
    data: {
      status: input.status || session.status || 'ready',
      lastHeartbeatAt: new Date(),
      ...(input.currentUrl !== undefined ? { currentUrl: input.currentUrl } : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
      ...(input.metadata
        ? { metadata: { ...prevMeta, ...input.metadata } as Prisma.InputJsonValue }
        : {}),
    },
  });

  return {
    sessionId: updated.id,
    agentId,
    status: updated.status,
    lastHeartbeatAt: updated.lastHeartbeatAt,
  };
}

export async function runtimeAgentOffline(input: {
  agentId: string;
  lastError?: string;
  requeueJobs?: boolean;
}) {
  const agentId = input.agentId.trim();
  await prisma.browserSession.updateMany({
    where: { workerId: agentId },
    data: {
      status: 'offline',
      lastHeartbeatAt: new Date(),
      ...(input.lastError ? { lastError: input.lastError.slice(0, 500) } : {}),
    },
  });

  let requeued = 0;
  if (input.requeueJobs !== false) {
    const res = await prisma.agentJob.updateMany({
      where: {
        claimedBy: agentId,
        status: { in: ['claimed', 'running'] },
      },
      data: {
        status: 'queued',
        claimedBy: null,
        claimedAt: null,
        startedAt: null,
        availableAt: new Date(),
        errorMessage: 'Requeued because Execution Agent went offline',
      },
    });
    requeued = res.count;
  }

  emitRuntimeEventAsync({
    type: 'AGENT_OFFLINE',
    agentId,
    entityType: 'agent',
    entityId: agentId,
    payload: { requeued },
  });

  return { agentId, status: 'offline', requeued };
}

export async function runtimeAgentClaimJob(input: {
  agentId: string;
  capabilities?: string[];
}) {
  const job = await claimNextJob(input.agentId, {
    capabilities: input.capabilities,
  });
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    companyId: job.companyId,
    missionId: job.missionId,
    missionRunId: job.missionRunId,
    sourceId: job.sourceId,
    priority: job.priority,
    payload: job.payload,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    claimedBy: job.claimedBy,
    claimedAt: job.claimedAt,
    startedAt: job.startedAt,
  };
}

export async function runtimeAgentCompleteJob(
  jobId: string,
  result: Record<string, unknown>,
) {
  await completeJob(jobId, result);
  return { jobId, status: 'completed' };
}

export async function runtimeAgentReleaseJob(jobId: string, errorMessage: string) {
  await releaseJobToQueue(jobId, errorMessage);
  return { jobId, status: 'released' };
}

export async function runtimeAgentRequeueJob(jobId: string, reason: string) {
  await requeueRunningJob(jobId, reason);
  return { jobId, status: 'queued' };
}

export async function runtimeAgentReclaim(input: { agentId: string; staleMs?: number }) {
  const count = await reclaimOrphanedAgentJobs({
    workerId: input.agentId,
    staleMs: input.staleMs,
  });
  return { reclaimed: count };
}
