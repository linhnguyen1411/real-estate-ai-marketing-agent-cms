import type { AgentJob } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { notifyJobFailed } from '../agent/agentNotificationService';
import { prisma } from '../prisma';
import { isNonRetryableBrowserErrorMessage } from './facebook/facebookCheckpointDetector';
import { emitRuntimeEventAsync } from '../modules/control-plane/runtimeEventBus';
import type { ClaimOptions } from './ports';
import { capabilityForJobType } from './ports';

export type ClaimedJob = AgentJob;

type ClaimCandidateRow = {
  id: string;
  type: string;
  priority: number;
  sourceId: string | null;
  missionId: string | null;
  attempts: number;
  payload: unknown;
};

/**
 * Atomically claim the next queued job using PostgreSQL row locking (SKIP LOCKED).
 * G2: Placement Engine picks the best job for this agent among candidates (soft assignment).
 * Priority: lower number = higher priority; then oldest createdAt.
 * Multi-agent: payload.targetAgentId only match that worker.
 * Capabilities: only claim job types the agent can run.
 */
export async function claimNextJob(
  workerId: string,
  options?: ClaimOptions,
): Promise<ClaimedJob | null> {
  const capabilities = options?.capabilities?.filter(Boolean) ?? [];

  // Fleet snapshot OUTSIDE transaction (avoid nested DB work under row locks).
  let fleetAgent = null as Awaited<
    ReturnType<typeof import('../modules/control-plane/fleet').getFleetAgent>
  > | null;
  let fleet: Awaited<
    ReturnType<typeof import('../modules/control-plane/fleet').listFleetAgents>
  > = [];
  try {
    const fleetMod = await import('../modules/control-plane/fleet');
    fleet = await fleetMod.listFleetAgents({});
    fleetAgent =
      fleet.find(a => a.agentId === workerId || a.workerId === workerId) ||
      (await fleetMod.getFleetAgent(workerId));
  } catch {
    fleetAgent = null;
    fleet = [];
  }

  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<ClaimCandidateRow[]>`
      SELECT id, type, priority, source_id AS "sourceId", mission_id AS "missionId",
             attempts, payload
      FROM agent_jobs
      WHERE status = 'queued'
        AND available_at <= NOW()
        AND (
          payload->>'targetAgentId' IS NULL
          OR payload->>'targetAgentId' = ''
          OR payload->>'targetAgentId' = ${workerId}
        )
      ORDER BY priority ASC, created_at ASC
      LIMIT 40
      FOR UPDATE SKIP LOCKED
    `;

    // Capability pre-filter (agent-declared)
    const capable = rows.filter(r => {
      if (capabilities.length === 0) return true;
      const need = capabilityForJobType(r.type);
      if (!need) return true;
      return (
        capabilities.includes(need) ||
        capabilities.includes('browser') ||
        (need === 'publish' &&
          (capabilities.includes('publish_timeline') ||
            capabilities.includes('publish_group')))
      );
    });

    let matchId: string | null = null;
    let placementPayload: Record<string, unknown> | null = null;

    try {
      const { planClaimForAgent } = await import(
        '../modules/control-plane/fleet-orchestrator/assignmentPlanner'
      );
      const { isMachineDraining, isMachineInMaintenance } = await import(
        '../modules/control-plane/fleet-orchestrator/policies'
      );

      if (
        isMachineDraining({ agentId: workerId }) ||
        isMachineInMaintenance({ agentId: workerId })
      ) {
        return null;
      }

      const plan = planClaimForAgent({
        agent: fleetAgent,
        agentId: workerId,
        candidates: capable.map(r => ({
          id: r.id,
          type: r.type,
          priority: r.priority,
          sourceId: r.sourceId,
          missionId: r.missionId,
          attempts: r.attempts,
          payload: r.payload,
        })),
        fleet,
        reserve: true,
      });

      matchId = plan.jobId;
      placementPayload = {
        placement: true,
        score: plan.decision.score,
        reasons: plan.decision.reasons.slice(0, 12),
        rejectedCount: plan.decision.rejected.length,
        breakdown: plan.decision.breakdown,
        policyMode: plan.decision.policyMode,
      };
    } catch {
      // Fallback: first capable row (legacy first-fit)
      matchId = capable[0]?.id ?? null;
      placementPayload = { placement: false, fallback: 'planner_error' };
    }

    if (!matchId) return null;

    const job = await tx.agentJob.update({
      where: { id: matchId },
      data: {
        status: 'running',
        claimedBy: workerId,
        claimedAt: new Date(),
        startedAt: new Date(),
      },
    });

    try {
      const { onClaimSuccess } = await import(
        '../modules/control-plane/fleet-orchestrator/orchestrator'
      );
      onClaimSuccess(job.id);
    } catch {
      /* ignore */
    }

    emitRuntimeEventAsync({
      type: 'JOB_CLAIMED',
      companyId: job.companyId,
      agentId: workerId,
      entityType: 'job',
      entityId: job.id,
      payload: {
        type: job.type,
        missionRunId: job.missionRunId,
        ...(placementPayload || {}),
      },
    });

    return job;
  });
}

export async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  const existing = await prisma.agentJob.findUnique({ where: { id: jobId } });
  const job = await prisma.agentJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      result: result as Prisma.InputJsonValue,
      finishedAt: new Date(),
      errorMessage: null,
      claimedBy: null,
      claimedAt: null,
    },
  });
  emitRuntimeEventAsync({
    type: 'JOB_COMPLETED',
    companyId: job.companyId,
    agentId: existing?.claimedBy ?? null,
    entityType: 'job',
    entityId: job.id,
    payload: { type: job.type, missionRunId: job.missionRunId },
  });
}

export async function releaseJobToQueue(jobId: string, errorMessage: string): Promise<void> {
  const job = await prisma.agentJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  // CDP busy / slot / browser busy — defer without burning attempts
  if (/^(CDP_BUSY|SLOT_BUSY|SLOT_STOPPED|BROWSER_BUSY)/.test(errorMessage)) {
    await prisma.agentJob.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        availableAt: new Date(Date.now() + 15_000),
        claimedBy: null,
        claimedAt: null,
        startedAt: null,
        errorMessage: errorMessage.slice(0, 500),
      },
    });
    if (/^SLOT_BUSY/.test(errorMessage)) {
      emitRuntimeEventAsync({
        type: 'SLOT_BUSY',
        companyId: job.companyId,
        agentId: job.claimedBy,
        entityType: 'job',
        entityId: jobId,
        payload: { errorMessage: errorMessage.slice(0, 200) },
      });
    }
    return;
  }

  const nextAttempts = job.attempts + 1;
  const nonRetryable = isNonRetryableBrowserErrorMessage(errorMessage);

  // G2: capability / browser rejection → planner learns via cooldown
  if (/capability|BROWSER_|missing_caps|required_browser/i.test(errorMessage)) {
    try {
      const { onClaimRejection, onJobFailedForCooldown } = await import(
        '../modules/control-plane/fleet-orchestrator/orchestrator'
      );
      onClaimRejection({ jobId, agentId: job.claimedBy || 'unknown', reason: errorMessage });
      onJobFailedForCooldown(jobId, errorMessage);
    } catch {
      /* ignore */
    }
  }

  if (!nonRetryable && nextAttempts < job.maxAttempts) {
    const backoffMs = Math.min(60_000 * 2 ** Math.max(0, nextAttempts - 1), 30 * 60_000);
    // Apply planner cooldown on repeated failures
    if (nextAttempts >= 2) {
      try {
        const { onJobFailedForCooldown } = await import(
          '../modules/control-plane/fleet-orchestrator/orchestrator'
        );
        onJobFailedForCooldown(jobId, errorMessage);
      } catch {
        /* ignore */
      }
    }
    await prisma.agentJob.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        attempts: nextAttempts,
        availableAt: new Date(Date.now() + backoffMs),
        claimedBy: null,
        claimedAt: null,
        startedAt: null,
        errorMessage,
      },
    });
    return;
  }

  await prisma.agentJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      attempts: nonRetryable ? job.maxAttempts : nextAttempts,
      finishedAt: new Date(),
      errorMessage,
      claimedBy: null,
      claimedAt: null,
    },
  });

  try {
    const { onJobFailedForCooldown } = await import(
      '../modules/control-plane/fleet-orchestrator/orchestrator'
    );
    onJobFailedForCooldown(jobId, errorMessage);
  } catch {
    /* ignore */
  }

  emitRuntimeEventAsync({
    type: 'JOB_FAILED',
    companyId: job.companyId,
    agentId: job.claimedBy,
    entityType: 'job',
    entityId: job.id,
    payload: { type: job.type, errorMessage: errorMessage.slice(0, 200) },
  });

  await notifyJobFailed({
    companyId: job.companyId,
    jobId: job.id,
    jobType: job.type,
    sourceId: job.sourceId,
    errorMessage,
    attempts: nonRetryable ? job.maxAttempts : nextAttempts,
  });
}

/** Requeue a running job without incrementing attempts (graceful shutdown). */
export async function requeueRunningJob(jobId: string, reason: string): Promise<void> {
  await prisma.agentJob.updateMany({
    where: { id: jobId, status: 'running' },
    data: {
      status: 'queued',
      claimedBy: null,
      claimedAt: null,
      startedAt: null,
      availableAt: new Date(Date.now() + 5_000),
      errorMessage: reason,
    },
  });
}

/**
 * Recover jobs left in claimed/running after a hard worker kill (no graceful shutdown).
 * Called once on worker boot. Does not change business publish semantics.
 */
export async function reclaimOrphanedAgentJobs(input: {
  workerId: string;
  staleMs?: number;
}): Promise<number> {
  const staleMs = input.staleMs ?? 90_000;
  const cutoff = new Date(Date.now() - staleMs);
  const result = await prisma.agentJob.updateMany({
    where: {
      status: { in: ['claimed', 'running'] },
      OR: [
        { startedAt: { lt: cutoff } },
        { claimedAt: { lt: cutoff } },
        {
          AND: [{ startedAt: null }, { claimedAt: null }, { updatedAt: { lt: cutoff } }],
        },
      ],
      // Never steal a job this same process just claimed
      NOT: { claimedBy: input.workerId },
    },
    data: {
      status: 'queued',
      claimedBy: null,
      claimedAt: null,
      startedAt: null,
      availableAt: new Date(),
      errorMessage: 'Reclaimed orphaned running job after worker death',
    },
  });
  return result.count;
}
