/**
 * Mission 2.0 — workflow domain types (pipeline definition + runtime statuses).
 */

export const WORKFLOW_STEP_TYPES = [
  'collect_source',
  'spam_filter',
  'dedupe',
  'extract_structured_data',
  'classify_subject',
  'ai_enrich',
  'summarize',
  'topic_match',
  'sentiment_analysis',
  'create_lead_intelligence',
  'create_external_inventory_candidate',
  'match_inventory',
  'generate_reply_draft',
  'notify_cms',
  'notify_telegram',
  'condition',
  'stop',
  'mark_ignored',
] as const;

export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number];

export const EXECUTION_TARGETS = ['local_worker', 'vps', 'either'] as const;
export type ExecutionTarget = (typeof EXECUTION_TARGETS)[number];

export const STEP_FAILURE_POLICIES = [
  'stop_workflow',
  'skip_step',
  'continue',
  'mark_partial',
] as const;
export type StepFailurePolicy = (typeof STEP_FAILURE_POLICIES)[number];

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'in',
  'not_in',
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
  'contains',
  'exists',
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const MISSION_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const MISSION_RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
] as const;
export type MissionRunStatus = (typeof MISSION_RUN_STATUSES)[number];

export const STEP_RUN_STATUSES = [
  'pending',
  'running',
  'completed',
  'skipped',
  'failed',
  'retrying',
  'cancelled',
] as const;
export type StepRunStatus = (typeof STEP_RUN_STATUSES)[number];

export const TRIGGER_TYPES = ['manual', 'schedule', 'api', 'recovery', 'ingest'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

/** Safe condition DSL — never eval. */
export interface ConditionConfig {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface StepRetryConfig {
  maxAttempts?: number;
  retryDelayMs?: number;
  onFailure?: StepFailurePolicy;
}

export interface WorkflowStepDefinition {
  id: string;
  type: WorkflowStepType;
  enabled?: boolean;
  dependsOn?: string[];
  config?: Record<string, unknown>;
  executionTarget?: ExecutionTarget;
  retry?: StepRetryConfig;
}

export interface WorkflowPipelineDefinition {
  version: number;
  steps: WorkflowStepDefinition[];
  /** Optional mission-level defaults */
  defaults?: {
    maxAttempts?: number;
    retryDelayMs?: number;
    onFailure?: StepFailurePolicy;
  };
}

export interface WorkflowStepResult {
  status: 'completed' | 'skipped';
  output?: unknown;
  producedResources?: {
    findingId?: string;
    externalInventoryId?: string;
    proposalId?: string;
    notificationIds?: string[];
  };
  metrics?: Record<string, number>;
  warnings?: string[];
  idempotent?: boolean;
}

export interface WorkflowStepContext {
  companyId: string | null;
  missionId: string;
  missionRunId: string;
  pipelineVersion: number;
  pipelineSnapshot: WorkflowPipelineDefinition;
  step: WorkflowStepDefinition;
  jobId?: string | null;
  sourceId?: string | null;
  scannedContentId?: string | null;
  findingId?: string | null;
  previousStepOutputs: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

/** Compact step output — never raw HTML / secrets / full prompts. */
export interface CompactStepOutput {
  summary?: string;
  decision?: string;
  resourceIds?: Record<string, string | string[] | undefined>;
  metrics?: Record<string, number>;
  warnings?: string[];
  classification?: string;
  finalScore?: number;
  blocked?: boolean;
  matched?: boolean;
  conditionPassed?: boolean;
  [key: string]: unknown;
}
