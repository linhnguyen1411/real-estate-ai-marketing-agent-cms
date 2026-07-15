import type { WorkflowPipelineDefinition } from '../domain/workflowTypes';
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
import { shouldExecuteStepOnRuntime, inferRuntimeTargetFromEnv } from '../../../agentSync/missionProvenance';

export interface ExecuteContentWorkflowInput {
  missionRunId: string;
  scannedContentId: string;
  jobId?: string | null;
  sourceId?: string | null;
  findingId?: string | null;
  missionRules?: Record<string, unknown>;
  /** When set, only steps matching this execution target run (local_worker | vps). */
  runtimeTarget?: 'local_worker' | 'vps';
}

export interface ExecuteContentWorkflowResult {
  missionRunId: string;
  scannedContentId: string;
  stepsCompleted: number;
  stepsSkipped: number;
  stepsFailed: number;
  findingsCreated: number;
  stopped: boolean;
}

function parsePipeline(snapshot: unknown): WorkflowPipelineDefinition {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray((snapshot as WorkflowPipelineDefinition).steps)) {
    throw new Error('Mission run has invalid pipeline snapshot');
  }
  return snapshot as WorkflowPipelineDefinition;
}

function contentLevelSteps(pipeline: WorkflowPipelineDefinition) {
  return topologicalSortSteps(pipeline).filter(s => s.type !== 'collect_source');
}

export async function executeContentWorkflow(
  input: ExecuteContentWorkflowInput,
): Promise<ExecuteContentWorkflowResult> {
  const run = await getMissionRunById(input.missionRunId);
  if (!run) {
    throw new Error(`Mission run not found: ${input.missionRunId}`);
  }

  const pipeline = parsePipeline(run.pipelineSnapshot);
  const steps = contentLevelSteps(pipeline);
  const runtimeTarget = input.runtimeTarget ?? inferRuntimeTargetFromEnv();
  const previousStepOutputs: Record<string, unknown> = {
    missionRules: input.missionRules ?? {},
  };

  const existingRuns = await listStepRunsForMissionRun(input.missionRunId);
  for (const sr of existingRuns) {
    if (sr.scannedContentId !== input.scannedContentId) continue;
    if ((sr.status === 'completed' || sr.status === 'skipped') && sr.output) {
      previousStepOutputs[sr.stepId] = sr.output;
    }
  }

  await markMissionRunRunning(input.missionRunId);

  const blocked = new Set<string>();
  let stepsCompleted = 0;
  let stepsSkipped = 0;
  let stepsFailed = 0;
  let findingsCreated = 0;
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
        sourceId: input.sourceId,
        scannedContentId: input.scannedContentId,
        stepId: step.id,
        stepType: step.type,
        pipelineVersion: pipeline.version,
        maxAttempts: step.retry?.maxAttempts ?? pipeline.defaults?.maxAttempts,
      });
      if (record.status === 'pending' || record.status === 'running') {
        await markStepTerminal(record.id, {
          status: 'skipped',
          output: { reason: 'blocked_by_upstream_condition' },
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
      sourceId: input.sourceId,
      scannedContentId: input.scannedContentId,
      stepId: step.id,
      stepType: step.type,
      pipelineVersion: pipeline.version,
      maxAttempts: step.retry?.maxAttempts ?? pipeline.defaults?.maxAttempts,
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
        sourceId: input.sourceId,
        scannedContentId: input.scannedContentId,
        findingId: input.findingId,
        previousStepOutputs,
      });

      await markStepTerminal(running.id, {
        status: result.status,
        output: result.output,
        findingId: result.producedResources?.findingId ?? input.findingId,
        startedAt: running.startedAt,
      });

      if (result.output) {
        previousStepOutputs[step.id] = result.output;
      }

      if (result.metrics) {
        for (const [k, v] of Object.entries(result.metrics)) {
          metricsDelta[k] = (metricsDelta[k] || 0) + (Number(v) || 0);
        }
        if (result.metrics.findingsCreated) {
          findingsCreated += Number(result.metrics.findingsCreated) || 0;
        }
      }

      if (result.producedResources?.findingId) {
        input.findingId = result.producedResources.findingId;
      }

      if (result.status === 'completed') stepsCompleted += 1;
      else stepsSkipped += 1;

      if (step.type === 'condition') {
        const out = result.output as { conditionPassed?: boolean } | undefined;
        if (out?.conditionPassed === false) {
          for (const id of collectDownstreamStepIds(pipeline, step.id)) {
            blocked.add(id);
          }
        }
      }

      if (step.type === 'spam_filter') {
        const out = result.output as { blocked?: boolean } | undefined;
        if (out?.blocked) {
          for (const id of collectDownstreamStepIds(pipeline, step.id)) {
            blocked.add(id);
          }
        }
      }

      if (step.type === 'stop') {
        stopped = true;
        for (const id of collectDownstreamStepIds(pipeline, step.id)) {
          blocked.add(id);
        }
      }
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
      if (policy === 'skip_step') {
        continue;
      }
      if (policy === 'mark_partial') {
        continue;
      }
      // continue — keep going
    }
  }

  metricsDelta.stepsCompleted = stepsCompleted;
  metricsDelta.stepsSkipped = stepsSkipped;
  metricsDelta.stepsFailed = stepsFailed;
  await mergeMissionRunMetrics(input.missionRunId, metricsDelta);
  await completeMissionRunIfSettled(input.missionRunId);

  return {
    missionRunId: input.missionRunId,
    scannedContentId: input.scannedContentId,
    stepsCompleted,
    stepsSkipped,
    stepsFailed,
    findingsCreated,
    stopped,
  };
}
