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
    const source = snapshotToSource(hydrated.scan.source);
    const mission = hydrated.scan.mission ? snapshotToMission(hydrated.scan.mission) : null;

    let resolvedSource = source;
    try {
      await prisma.agentSource.upsert({
        where: { id: source.id },
        create: {
          id: source.id,
          companyId: source.companyId,
          name: source.name,
          type: source.type,
          url: source.url,
          status: source.status,
          priority: source.priority,
          scanIntervalMinutes: source.scanIntervalMinutes,
          config: source.config as never,
          checkpoint: source.checkpoint as never,
          syncStatus: 'synced',
        },
        update: {
          name: source.name,
          type: source.type,
          url: source.url,
          status: source.status,
          priority: source.priority,
          scanIntervalMinutes: source.scanIntervalMinutes,
          config: source.config as never,
          checkpoint: source.checkpoint as never,
          lastError: null,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!/Unique constraint|unique/i.test(msg)) throw error;
      const conflict = await prisma.agentSource.findFirst({
        where: {
          companyId: source.companyId,
          url: source.url,
          NOT: { id: source.id },
        },
        select: { id: true, _count: { select: { scannedContents: true } } },
      });
      if (!conflict) throw error;
      if (conflict._count.scannedContents > 0) {
        console.warn(
          `[scan] hydrated source ${source.id} conflicts with local ${conflict.id} ` +
            `(same url, ${conflict._count.scannedContents} contents) — using local id`,
        );
        resolvedSource = await prisma.agentSource.findUniqueOrThrow({ where: { id: conflict.id } });
      } else {
        await prisma.agentSource.delete({ where: { id: conflict.id } });
        await prisma.agentSource.create({
          data: {
            id: source.id,
            companyId: source.companyId,
            name: source.name,
            type: source.type,
            url: source.url,
            status: source.status,
            priority: source.priority,
            scanIntervalMinutes: source.scanIntervalMinutes,
            config: source.config as never,
            checkpoint: source.checkpoint as never,
            syncStatus: 'synced',
          },
        });
      }
    }

    if (mission) {
      await prisma.agentMission.upsert({
        where: { id: mission.id },
        create: {
          id: mission.id,
          companyId: mission.companyId,
          name: mission.name,
          objective: mission.objective || '',
          status: mission.status,
          rules: mission.rules as never,
          pipeline: mission.pipeline as never,
          pipelineVersion: mission.pipelineVersion ?? 1,
        },
        update: {
          name: mission.name,
          status: mission.status,
          rules: mission.rules as never,
          pipeline: mission.pipeline as never,
          pipelineVersion: mission.pipelineVersion ?? 1,
        },
      });
    }

    return { source: resolvedSource, mission };
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
