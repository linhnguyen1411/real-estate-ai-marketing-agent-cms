/**
 * Mission 2.0 provenance helpers — shared between local enqueue and VPS ingest.
 */
import type { ExecutionTarget } from '../modules/mission-engine/domain/workflowTypes';

export type MissionProvenanceStepRef = {
  stepId: string;
  stepType: string;
  status: 'completed' | 'skipped' | 'failed';
  executionTarget?: ExecutionTarget | null;
  output?: Record<string, unknown> | null;
  findingId?: string | null;
  externalInventoryId?: string | null;
  completedAt?: string | null;
};

export type MissionWorkflowProvenance = {
  missionId: string | null;
  missionRunId: string | null;
  missionVersion: number | null;
  pipelineVersion: number | null;
  pipelineHash: string | null;
  jobId: string | null;
  sourceId: string | null;
  sourceExternalKey: string | null;
  localScannedContentId: string | null;
  executionTarget: 'local_worker' | 'vps';
  capturedAt: string;
  workerId: string | null;
  completedLocalSteps: MissionProvenanceStepRef[];
  pipelineSnapshot?: unknown;
};

export function extractMissionProvenance(payload: Record<string, unknown>): MissionWorkflowProvenance | null {
  const missionRunId = String(payload.missionRunId || '').trim() || null;
  if (!missionRunId) return null;

  const workflow =
    payload.missionWorkflow && typeof payload.missionWorkflow === 'object'
      ? (payload.missionWorkflow as Record<string, unknown>)
      : payload;

  const stepsRaw = workflow.completedLocalSteps ?? payload.completedLocalSteps;
  const completedLocalSteps: MissionProvenanceStepRef[] = Array.isArray(stepsRaw)
    ? stepsRaw
        .map(s => {
          if (!s || typeof s !== 'object') return null;
          const row = s as Record<string, unknown>;
          const stepId = String(row.stepId || '').trim();
          const stepType = String(row.stepType || '').trim();
          const status = String(row.status || 'completed').trim() as MissionProvenanceStepRef['status'];
          if (!stepId || !stepType) return null;
          return {
            stepId,
            stepType,
            status,
            executionTarget: (row.executionTarget as ExecutionTarget | null) ?? null,
            output: (row.output as Record<string, unknown> | null) ?? null,
            findingId: row.findingId != null ? String(row.findingId) : null,
            externalInventoryId:
              row.externalInventoryId != null ? String(row.externalInventoryId) : null,
            completedAt: row.completedAt != null ? String(row.completedAt) : null,
          };
        })
        .filter(Boolean) as MissionProvenanceStepRef[]
    : [];

  return {
    missionId: String(workflow.missionId ?? payload.missionId ?? '').trim() || null,
    missionRunId,
    missionVersion:
      workflow.missionVersion != null
        ? Number(workflow.missionVersion)
        : payload.missionVersion != null
          ? Number(payload.missionVersion)
          : null,
    pipelineVersion:
      workflow.pipelineVersion != null
        ? Number(workflow.pipelineVersion)
        : payload.pipelineVersion != null
          ? Number(payload.pipelineVersion)
          : null,
    pipelineHash:
      String(workflow.pipelineHash ?? payload.pipelineHash ?? '').trim() || null,
    jobId: String(workflow.jobId ?? payload.jobId ?? '').trim() || null,
    sourceId: String(workflow.sourceId ?? payload.sourceId ?? '').trim() || null,
    sourceExternalKey:
      String(workflow.sourceExternalKey ?? payload.sourceExternalKey ?? '').trim() || null,
    localScannedContentId:
      String(workflow.localScannedContentId ?? payload.localScannedContentId ?? '').trim() ||
      null,
    executionTarget:
      String(workflow.executionTarget ?? payload.executionTarget ?? 'vps') === 'local_worker'
        ? 'local_worker'
        : 'vps',
    capturedAt: String(workflow.capturedAt ?? payload.capturedAt ?? new Date().toISOString()),
    workerId: String(workflow.workerId ?? payload.workerId ?? '').trim() || null,
    completedLocalSteps,
    pipelineSnapshot: workflow.pipelineSnapshot ?? payload.pipelineSnapshot,
  };
}

export function shouldExecuteStepOnRuntime(
  stepTarget: ExecutionTarget | undefined | null,
  runtimeTarget: 'local_worker' | 'vps',
): boolean {
  const target = stepTarget || 'either';
  if (target === 'either') return true;
  return target === runtimeTarget;
}

export function inferRuntimeTargetFromEnv(): 'local_worker' | 'vps' {
  const raw = String(process.env.MISSION_WORKFLOW_RUNTIME || '').trim().toLowerCase();
  if (raw === 'local_worker' || raw === 'local') return 'local_worker';
  if (raw === 'vps') return 'vps';
  if (process.env.AGENT_WORKER_ID || process.env.AGENT_SYNC_WORKER_ID) {
    return 'local_worker';
  }
  return 'vps';
}
