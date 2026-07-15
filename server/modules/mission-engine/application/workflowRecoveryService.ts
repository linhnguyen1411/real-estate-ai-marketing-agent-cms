/**
 * Recover stale Mission 2.0 step runs after worker/API crash.
 */

import { prisma } from '../../../prisma';
import {
  completeMissionRunIfSettled,
  updateMissionRun,
} from '../repositories/missionRunRepository';
import { listStaleRunningSteps, markStepTerminal } from '../repositories/workflowStepRunRepository';
import { executeContentWorkflow } from './workflowExecutionService';

const DEFAULT_STALE_MS = 15 * 60 * 1000;

export interface RecoverStaleRunsResult {
  dryRun: boolean;
  staleFound: number;
  resetToRetry: number;
  cancelled: number;
  requeuedContents: number;
  completedRunsChecked: number;
}

export async function recoverStaleMissionRuns(input?: {
  dryRun?: boolean;
  staleMs?: number;
  limit?: number;
}): Promise<RecoverStaleRunsResult> {
  const dryRun = input?.dryRun !== false;
  const staleMs = input?.staleMs ?? DEFAULT_STALE_MS;
  const olderThan = new Date(Date.now() - staleMs);

  const stale = await listStaleRunningSteps({ olderThan, limit: input?.limit ?? 100 });
  const result: RecoverStaleRunsResult = {
    dryRun,
    staleFound: stale.length,
    resetToRetry: 0,
    cancelled: 0,
    requeuedContents: 0,
    completedRunsChecked: 0,
  };

  const requeueKeys = new Set<string>();

  for (const step of stale) {
    const canRetry = step.attempts < step.maxAttempts;
    if (dryRun) {
      if (canRetry) result.resetToRetry += 1;
      else result.cancelled += 1;
      continue;
    }

    if (canRetry) {
      await prisma.agentWorkflowStepRun.update({
        where: { id: step.id },
        data: {
          status: 'pending',
          errorCode: 'stale_recovered',
          errorMessage: `Reset after running > ${staleMs}ms`,
          completedAt: null,
          durationMs: null,
        },
      });
      result.resetToRetry += 1;
      if (step.scannedContentId) {
        requeueKeys.add(`${step.missionRunId}:${step.scannedContentId}`);
      }
    } else {
      await markStepTerminal(step.id, {
        status: 'failed',
        errorCode: 'stale_max_attempts',
        errorMessage: 'Stale step exceeded maxAttempts',
        startedAt: step.startedAt,
      });
      result.cancelled += 1;
    }
  }

  if (!dryRun) {
    for (const key of requeueKeys) {
      const [missionRunId, scannedContentId] = key.split(':');
      const sample = stale.find(
        s => s.missionRunId === missionRunId && s.scannedContentId === scannedContentId,
      );
      await executeContentWorkflow({
        missionRunId,
        scannedContentId,
        jobId: sample?.jobId,
        sourceId: sample?.sourceId,
      });
      result.requeuedContents += 1;
    }

    const openRuns = await prisma.agentMissionRun.findMany({
      where: { status: { in: ['queued', 'running'] } },
      select: { id: true },
      take: 50,
    });
    for (const run of openRuns) {
      await completeMissionRunIfSettled(run.id);
      result.completedRunsChecked += 1;
    }
  }

  return result;
}

export async function cancelMissionRunCascade(missionRunId: string) {
  await updateMissionRun(missionRunId, {
    status: 'cancelled',
    completedAt: new Date(),
    error: 'Cancelled',
  });
  await prisma.agentWorkflowStepRun.updateMany({
    where: { missionRunId, status: { in: ['pending', 'running', 'retrying'] } },
    data: { status: 'cancelled', completedAt: new Date() },
  });
  await prisma.agentJob.updateMany({
    where: { missionRunId, status: { in: ['queued', 'claimed', 'running'] } },
    data: { status: 'cancelled', finishedAt: new Date() },
  });
}
