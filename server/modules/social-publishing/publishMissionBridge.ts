/**
 * Bridge: SocialPublishJob → MissionRun + AgentJob publish_social.
 * Queue creates mission run; worker executes workflow (like scanner pattern).
 */

import { prisma } from '../../prisma';
import { pipelineSnapshotHash } from '../mission-engine/domain/workflowPolicies';
import {
  PUBLISH_BROWSER_CONTENT_PIPELINE,
  PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY,
} from '../mission-engine/domain/publishMissionTemplate';
import { createMissionRun } from '../mission-engine/repositories/missionRunRepository';
import { appendAuditLog } from './auditService';
import { AGENT_JOB_TYPE_PUBLISH_SOCIAL } from './types';

export const PUBLISH_MISSION_NAME = 'Browser Publish (system)';

export async function findOrCreatePublishMission(companyId: string | null): Promise<string> {
  const existing = await prisma.agentMission.findFirst({
    where: {
      companyId: companyId ?? null,
      templateKey: PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY,
      status: { in: ['active', 'draft'] },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing.id;

  const mission = await prisma.agentMission.create({
    data: {
      companyId,
      name: PUBLISH_MISSION_NAME,
      objective: 'Browser publish approved social drafts via Mission workflow.',
      status: 'active',
      templateKey: PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY,
      pipeline: PUBLISH_BROWSER_CONTENT_PIPELINE as object,
      pipelineVersion: PUBLISH_BROWSER_CONTENT_PIPELINE.version,
      rules: {
        templateId: PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY,
        publishOnly: true,
      },
    },
  });
  return mission.id;
}

function readMissionRunIdFromJobResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const id = (result as { missionRunId?: unknown }).missionRunId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export async function startPublishMissionRun(input: {
  publishJobId: string;
  companyId?: string | null;
  triggeredBy?: string | null;
  triggerType?: string;
}): Promise<{ missionRunId: string; agentJobId: string; created: boolean }> {
  const job = await prisma.socialPublishJob.findUnique({
    where: { id: input.publishJobId },
    include: { draft: true, channel: true },
  });
  if (!job) throw new Error(`SocialPublishJob not found: ${input.publishJobId}`);
  if (!job.draft || !job.channel) {
    throw new Error('Publish job missing draft or destination');
  }

  const existingRunId = readMissionRunIdFromJobResult(job.result);
  if (existingRunId) {
    const existingRun = await prisma.agentMissionRun.findUnique({ where: { id: existingRunId } });
    if (existingRun && !['completed', 'cancelled', 'failed'].includes(existingRun.status)) {
      const activeAgentJob = await prisma.agentJob.findFirst({
        where: {
          type: AGENT_JOB_TYPE_PUBLISH_SOCIAL,
          missionRunId: existingRunId,
          status: { in: ['queued', 'claimed', 'running'] },
        },
        select: { id: true },
      });
      if (activeAgentJob) {
        return { missionRunId: existingRunId, agentJobId: activeAgentJob.id, created: false };
      }
    }
  }

  const companyId = input.companyId ?? job.companyId ?? job.draft.companyId ?? null;
  const missionId = await findOrCreatePublishMission(companyId);
  const pipeline = PUBLISH_BROWSER_CONTENT_PIPELINE;
  const pipelineHash = pipelineSnapshotHash(pipeline);

  const run = await createMissionRun({
    companyId,
    missionId,
    missionVersion: pipeline.version,
    pipelineSnapshot: pipeline,
    pipelineHash,
    triggerType: input.triggerType ?? 'api',
    triggeredBy: input.triggeredBy ?? null,
    status: 'queued',
  });

  await prisma.socialPublishJob.update({
    where: { id: job.id },
    data: {
      result: {
        ...(job.result && typeof job.result === 'object' ? (job.result as object) : {}),
        missionRunId: run.id,
        missionId,
        destinationKey: job.channel.type,
      },
    },
  });

  const agentJob = await prisma.agentJob.create({
    data: {
      companyId,
      missionId,
      missionRunId: run.id,
      type: AGENT_JOB_TYPE_PUBLISH_SOCIAL,
      status: 'queued',
      priority: 5,
      availableAt: new Date(),
      payload: {
        publishJobId: job.id,
        missionRunId: run.id,
        triggeredBy: input.triggeredBy ?? 'publish_mission_bridge',
      },
    },
  });

  await appendAuditLog({
    companyId,
    entityType: 'SocialPublishJob',
    entityId: job.id,
    action: 'mission_run_started',
    actor: input.triggeredBy,
    metadata: { missionRunId: run.id, agentJobId: agentJob.id },
  });

  return { missionRunId: run.id, agentJobId: agentJob.id, created: true };
}
