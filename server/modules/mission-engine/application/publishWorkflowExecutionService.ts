/**
 * Execute browser publish workflow on local_worker runtime.
 * Parallel to executeContentWorkflow — keyed by publishJobId, not scannedContentId.
 */

import type { WorkflowPipelineDefinition } from '../domain/workflowTypes';
import { isBrowserPublishPipeline } from '../domain/publishMissionTemplate';
import { collectDownstreamStepIds, topologicalSortSteps } from '../domain/workflowGraph';
import { resolveFailurePolicy } from '../domain/workflowPolicies';
import {
  completeMissionRunIfSettled,
  getMissionRunById,
  markMissionRunRunning,
  mergeMissionRunMetrics,
} from '../repositories/missionRunRepository';
import {
  ensureStepRun,
  listStepRunsForMissionRun,
  markStepRunning,
  markStepTerminal,
} from '../repositories/workflowStepRunRepository';
import { requireHandler } from './workflowStepDispatcher';
import { shouldExecuteStepOnRuntime } from '../../../agentSync/missionProvenance';

export interface ExecutePublishWorkflowInput {
  missionRunId: string;
  publishJobId: string;
  jobId: string;
  workerId?: string | null;
  browserSessionId?: string | null;
  runtimeTarget?: 'local_worker' | 'vps';
}

export interface ExecutePublishWorkflowResult {
  missionRunId: string;
  publishJobId: string;
  stepsCompleted: number;
  stepsSkipped: number;
  stepsFailed: number;
  stopped: boolean;
}

function parsePipeline(snapshot: unknown): WorkflowPipelineDefinition {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray((snapshot as WorkflowPipelineDefinition).steps)) {
    throw new Error('Mission run has invalid pipeline snapshot');
  }
  return snapshot as WorkflowPipelineDefinition;
}

function publishLevelSteps(pipeline: WorkflowPipelineDefinition) {
  if (!isBrowserPublishPipeline(pipeline)) {
    throw new Error('Mission run pipeline is not a browser publish workflow');
  }
  return topologicalSortSteps(pipeline);
}

export async function executePublishWorkflow(
  input: ExecutePublishWorkflowInput,
): Promise<ExecutePublishWorkflowResult> {
  const run = await getMissionRunById(input.missionRunId);
  if (!run) {
    throw new Error(`Mission run not found: ${input.missionRunId}`);
  }

  const pipeline = parsePipeline(run.pipelineSnapshot);
  const steps = publishLevelSteps(pipeline);
  const runtimeTarget = input.runtimeTarget ?? 'local_worker';

  const previousStepOutputs: Record<string, unknown> = {
    workerId: input.workerId ?? null,
    browserSessionId: input.browserSessionId ?? null,
  };

  const existingRuns = await listStepRunsForMissionRun(input.missionRunId);
  for (const sr of existingRuns) {
    if (sr.jobId !== input.jobId && sr.jobId) continue;
    if ((sr.status === 'completed' || sr.status === 'skipped') && sr.output) {
      previousStepOutputs[sr.stepId] = sr.output;
    }
  }

  await markMissionRunRunning(input.missionRunId);

  const blocked = new Set<string>();
  let stepsCompleted = 0;
  let stepsSkipped = 0;
  let stepsFailed = 0;
  let stopped = false;
  const metricsDelta: Record<string, number> = {};

  for (const step of steps) {
    if (!shouldExecuteStepOnRuntime(step.executionTarget, runtimeTarget)) {
      continue;
    }

    if (blocked.has(step.id)) {
      const { record } = await ensureStepRun({
        companyId: run.companyId,
        missionRunId: run.id,
        missionId: run.missionId,
        jobId: input.jobId,
        stepId: step.id,
        stepType: step.type,
        pipelineVersion: pipeline.version,
        maxAttempts: step.retry?.maxAttempts ?? pipeline.defaults?.maxAttempts,
        inputRef: { publishJobId: input.publishJobId },
      });
      if (record.status === 'pending' || record.status === 'running') {
        await markStepTerminal(record.id, {
          status: 'skipped',
          output: { reason: 'blocked_by_upstream' },
        });
      }
      stepsSkipped += 1;
      continue;
    }

    const { record } = await ensureStepRun({
      companyId: run.companyId,
      missionRunId: run.id,
      missionId: run.missionId,
      jobId: input.jobId,
      stepId: step.id,
      stepType: step.type,
      pipelineVersion: pipeline.version,
      maxAttempts: step.retry?.maxAttempts ?? pipeline.defaults?.maxAttempts,
      inputRef: { publishJobId: input.publishJobId },
    });

    if (record.status === 'completed') {
      if (record.output) previousStepOutputs[step.id] = record.output;
      stepsCompleted += 1;
      continue;
    }
    if (record.status === 'skipped' || record.status === 'cancelled') {
      if (record.output) previousStepOutputs[step.id] = record.output;
      stepsSkipped += 1;
      continue;
    }
    if (record.status === 'failed') {
      stepsFailed += 1;
      continue;
    }

    const running = await markStepRunning(record.id);
    const handler = requireHandler(step.type);

    try {
      const result = await handler.execute({
        companyId: run.companyId,
        missionId: run.missionId,
        missionRunId: run.id,
        pipelineVersion: pipeline.version,
        pipelineSnapshot: pipeline,
        step,
        jobId: input.jobId,
        publishJobId: input.publishJobId,
        previousStepOutputs,
      });

      await markStepTerminal(running.id, {
        status: result.status,
        output: result.output,
        startedAt: running.startedAt,
      });

      if (result.output) {
        previousStepOutputs[step.id] = result.output;
        if (step.id === 'prepare' && result.output && typeof result.output === 'object') {
          const out = result.output as Record<string, unknown>;
          if (out.__publish__) previousStepOutputs.__publish__ = out.__publish__;
        }
      }

      if (result.status === 'completed') stepsCompleted += 1;
      else stepsSkipped += 1;
    } catch (err) {
      const policy = resolveFailurePolicy(
        step.retry?.onFailure,
        pipeline.defaults?.onFailure,
        step.type,
      );
      const message = err instanceof Error ? err.message : String(err);
      await markStepTerminal(running.id, {
        status: 'failed',
        errorCode: 'step_execution_failed',
        errorMessage: message.slice(0, 2000),
        startedAt: running.startedAt,
      });
      stepsFailed += 1;

      if (policy === 'stop_workflow') {
        stopped = true;
        for (const id of collectDownstreamStepIds(pipeline, step.id)) {
          blocked.add(id);
        }
        break;
      }
    }
  }

  metricsDelta.stepsCompleted = stepsCompleted;
  metricsDelta.stepsSkipped = stepsSkipped;
  metricsDelta.stepsFailed = stepsFailed;
  await mergeMissionRunMetrics(input.missionRunId, metricsDelta);
  await completeMissionRunIfSettled(input.missionRunId);

  return {
    missionRunId: input.missionRunId,
    publishJobId: input.publishJobId,
    stepsCompleted,
    stepsSkipped,
    stepsFailed,
    stopped,
  };
}
