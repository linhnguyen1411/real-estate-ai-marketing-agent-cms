/**
 * JobQueuePort over Runtime API — Execution Agent has no DB access.
 */

import type { AgentJob } from '@prisma/client';
import type { ClaimOptions, JobQueuePort } from '../agent-worker/ports';
import type { RuntimeAgentClient } from './runtimeClient';

function toAgentJob(raw: Record<string, unknown>): AgentJob {
  return {
    id: String(raw.id),
    companyId: (raw.companyId as string | null) ?? null,
    missionId: (raw.missionId as string | null) ?? null,
    missionRunId: (raw.missionRunId as string | null) ?? null,
    sourceId: (raw.sourceId as string | null) ?? null,
    type: String(raw.type),
    status: String(raw.status || 'running'),
    priority: Number(raw.priority) || 5,
    payload: (raw.payload as never) ?? {},
    result: null,
    attempts: Number(raw.attempts) || 0,
    maxAttempts: Number(raw.maxAttempts) || 3,
    claimedBy: (raw.claimedBy as string | null) ?? null,
    claimedAt: raw.claimedAt ? new Date(String(raw.claimedAt)) : null,
    startedAt: raw.startedAt ? new Date(String(raw.startedAt)) : null,
    finishedAt: null,
    availableAt: new Date(),
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AgentJob;
}

export function createHttpJobQueuePort(
  client: RuntimeAgentClient,
  agentId: string,
): JobQueuePort {
  return {
    async claimNext(_workerId, options?: ClaimOptions) {
      const job = await client.claimJob({
        agentId,
        capabilities: options?.capabilities,
        preferTypes: options?.preferTypes,
        excludeTypes: options?.excludeTypes,
      });
      if (!job) return null;
      return toAgentJob(job);
    },
    async complete(jobId, result) {
      await client.completeJob(jobId, result);
    },
    async release(jobId, errorMessage) {
      await client.releaseJob(jobId, errorMessage);
    },
    async requeue(jobId, reason) {
      await client.requeueJob(jobId, reason);
    },
  };
}
