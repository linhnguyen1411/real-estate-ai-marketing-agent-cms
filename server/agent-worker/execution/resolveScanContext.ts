/**
 * G1 — Resolve scan execution context from hydrated job payload (no DB).
 */

import type { AgentJob, AgentMission, AgentSource } from '@prisma/client';
import {
  readHydratedExecution,
  type MissionExecutionSnapshot,
  type SourceExecutionSnapshot,
} from '../../modules/control-plane/execution/jobPayloadContract';
import { assertAgentSourceActiveForScan } from '../../agent/agentDb';
import { prisma } from '../../prisma';
import { isStatelessExecutionAgent } from './stateless';

function snapshotToSource(snapshot: SourceExecutionSnapshot): AgentSource {
  return {
    id: snapshot.id,
    companyId: snapshot.companyId,
    name: snapshot.name,
    type: snapshot.type,
    url: snapshot.url,
    status: snapshot.status,
    priority: snapshot.priority,
    scanIntervalMinutes: snapshot.scanIntervalMinutes,
    config: snapshot.config as AgentSource['config'],
    checkpoint: snapshot.checkpoint as AgentSource['checkpoint'],
    lastScannedAt: null,
    nextScanAt: null,
    lastError: null,
    externalSourceKey: null,
    syncStatus: 'local_only',
    remoteId: null,
    lastSyncAt: null,
    syncError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function snapshotToMission(snapshot: MissionExecutionSnapshot): AgentMission {
  return {
    id: snapshot.id,
    companyId: snapshot.companyId,
    ownerUserId: null,
    name: snapshot.name,
    objective: '',
    status: snapshot.status,
    rules: snapshot.rules as AgentMission['rules'],
    schedule: null,
    pipeline: snapshot.pipeline as AgentMission['pipeline'],
    pipelineVersion: snapshot.pipelineVersion ?? 1,
    templateKey: null,
    nextRunAt: null,
    lastRunAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function resolveScanExecutionContext(job: AgentJob): Promise<{
  source: AgentSource;
  mission: AgentMission | null;
}> {
  const hydrated = readHydratedExecution(job.payload);
  if (hydrated?.scan?.source) {
    return {
      source: snapshotToSource(hydrated.scan.source),
      mission: hydrated.scan.mission ? snapshotToMission(hydrated.scan.mission) : null,
    };
  }

  if (isStatelessExecutionAgent()) {
    throw new Error(
      'Stateless Execution Agent: scan_source job missing payload.execution.scan — hydrate at claim.',
    );
  }

  const payload = (job.payload || {}) as Record<string, unknown>;
  const sourceId = String(job.sourceId || payload.sourceId || '').trim();
  if (!sourceId) throw new Error('scan_source thiếu sourceId.');

  const source = await assertAgentSourceActiveForScan(sourceId);
  const missionId = job.missionId || (payload.missionId ? String(payload.missionId) : null);
  const mission = missionId
    ? await prisma.agentMission.findUnique({ where: { id: missionId } })
    : null;

  return { source, mission };
}
