/**
 * G1 — Hydrate AgentJob payloads on Control Plane before dispatch to Execution Agent.
 */

import type { AgentJob, AgentMission, AgentMissionRun, AgentSource } from '@prisma/client';
import { AgentSourceRemovedError } from '../../../agent/agentDb';
import { prisma } from '../../../prisma';
import {
  buildPublishWorkflowPayloadFromRecords,
  type PublishWorkflowPayload,
} from '../../social-publishing/publishWorkflowContext';
import {
  EXECUTION_PAYLOAD_SCHEMA,
  type BrowserCapabilitySnapshot,
  type HydratedExecutionPayload,
  type MissionExecutionSnapshot,
  type MissionRunExecutionSnapshot,
  type RetryPolicySnapshot,
  type ScanSourceExecutionBundle,
  type SourceExecutionSnapshot,
} from './jobPayloadContract';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function snapshotSource(source: AgentSource): SourceExecutionSnapshot {
  const config = asRecord(source.config);
  return {
    id: source.id,
    companyId: source.companyId,
    name: source.name,
    type: source.type,
    url: source.url,
    status: source.status,
    priority: source.priority,
    scanIntervalMinutes: source.scanIntervalMinutes,
    config,
    checkpoint: source.checkpoint ?? null,
    scanMode: typeof config.scanMode === 'string' ? config.scanMode : null,
    platform: source.type.includes('facebook') ? 'facebook' : source.type,
  };
}

export function snapshotMission(mission: AgentMission): MissionExecutionSnapshot {
  return {
    id: mission.id,
    companyId: mission.companyId,
    name: mission.name,
    status: mission.status,
    rules: asRecord(mission.rules),
    pipeline: mission.pipeline ?? null,
    pipelineVersion: mission.pipelineVersion ?? null,
  };
}

export function snapshotMissionRun(run: AgentMissionRun): MissionRunExecutionSnapshot {
  return {
    id: run.id,
    missionId: run.missionId,
    companyId: run.companyId,
    status: run.status,
    pipelineSnapshot: run.pipelineSnapshot,
    pipelineHash: run.pipelineHash,
    pipelineVersion: run.missionVersion != null ? String(run.missionVersion) : null,
  };
}

function defaultBrowserCaps(sourceType: string): BrowserCapabilitySnapshot {
  const facebook = sourceType.includes('facebook');
  return {
    browserMode: facebook ? 'cdp' : 'managed',
    capabilities: ['scan', 'publish', 'browser', ...(facebook ? ['cdp'] : [])],
    cdpRequired: facebook,
  };
}

function retrySnapshot(job: AgentJob): RetryPolicySnapshot {
  return {
    maxAttempts: job.maxAttempts,
    attempts: job.attempts,
  };
}

export async function hydrateScanSourceJob(job: AgentJob): Promise<ScanSourceExecutionBundle> {
  const payload = asRecord(job.payload);
  const sourceId = String(job.sourceId || payload.sourceId || '').trim();
  if (!sourceId) throw new Error('scan_source thiếu sourceId.');

  const source = await prisma.agentSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new AgentSourceRemovedError(sourceId, 'missing');
  if (source.status !== 'active') throw new AgentSourceRemovedError(sourceId, 'inactive');

  const missionId = job.missionId || (payload.missionId ? String(payload.missionId) : null);
  const mission = missionId
    ? await prisma.agentMission.findUnique({ where: { id: missionId } })
    : null;

  const missionRun = job.missionRunId
    ? await prisma.agentMissionRun.findUnique({ where: { id: job.missionRunId } })
    : null;

  return {
    jobType: 'scan_source',
    source: snapshotSource(source),
    mission: mission ? snapshotMission(mission) : null,
    missionRun: missionRun ? snapshotMissionRun(missionRun) : null,
    browser: defaultBrowserCaps(source.type),
    retry: retrySnapshot(job),
    checkpoint: source.checkpoint ?? null,
    hydratedAt: new Date().toISOString(),
  };
}

export async function hydratePublishSocialJob(job: AgentJob) {
  const payload = asRecord(job.payload);
  const publishJobId = String(payload.publishJobId || '').trim();
  if (!publishJobId) throw new Error('publish_social missing publishJobId');

  const jobRow = await prisma.socialPublishJob.findUnique({
    where: { id: publishJobId },
    include: {
      draft: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
      channel: true,
    },
  });
  if (!jobRow?.draft || !jobRow.channel) {
    throw new Error(`Publish job missing draft/channel: ${publishJobId}`);
  }

  const publish: PublishWorkflowPayload = buildPublishWorkflowPayloadFromRecords(jobRow);

  const missionRun = job.missionRunId
    ? await prisma.agentMissionRun.findUnique({ where: { id: job.missionRunId } })
    : null;

  return {
    jobType: 'publish_social' as const,
    publishJobId,
    missionRunId: job.missionRunId,
    publish,
    missionRun: missionRun ? snapshotMissionRun(missionRun) : null,
    browser: {
      browserMode: 'cdp' as const,
      capabilities: ['scan', 'publish', 'browser', 'cdp'],
      cdpRequired: true,
    },
    retry: retrySnapshot(job),
    hydratedAt: new Date().toISOString(),
  };
}

export async function hydrateJobForExecution(job: AgentJob): Promise<AgentJob> {
  const payload = asRecord(job.payload);
  const existing = payload.execution as HydratedExecutionPayload | undefined;
  if (existing?.schemaVersion === EXECUTION_PAYLOAD_SCHEMA) {
    return job;
  }

  let execution: HydratedExecutionPayload = { schemaVersion: EXECUTION_PAYLOAD_SCHEMA };

  if (job.type === 'scan_source' || job.type === 'source_scan') {
    execution = { schemaVersion: EXECUTION_PAYLOAD_SCHEMA, scan: await hydrateScanSourceJob(job) };
  } else if (job.type === 'publish_social') {
    execution = {
      schemaVersion: EXECUTION_PAYLOAD_SCHEMA,
      publish: await hydratePublishSocialJob(job),
    };
  }

  if (!execution.scan && !execution.publish) {
    return job;
  }

  return {
    ...job,
    payload: {
      ...payload,
      execution,
    } as AgentJob['payload'],
  };
}
