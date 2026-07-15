/**
 * Pipeline definition validation — uniqueness, deps, cycles, safe conditions.
 */

import {
  CONDITION_OPERATORS,
  EXECUTION_TARGETS,
  STEP_FAILURE_POLICIES,
  WORKFLOW_STEP_TYPES,
  type ConditionConfig,
  type WorkflowPipelineDefinition,
  type WorkflowStepDefinition,
  type WorkflowStepType,
} from './workflowTypes';

export interface PipelineValidationIssue {
  code: string;
  message: string;
  stepId?: string;
}

export interface PipelineValidationResult {
  ok: boolean;
  issues: PipelineValidationIssue[];
}

const STEP_TYPE_SET = new Set<string>(WORKFLOW_STEP_TYPES);
const OP_SET = new Set<string>(CONDITION_OPERATORS);
const TARGET_SET = new Set<string>(EXECUTION_TARGETS);
const FAIL_SET = new Set<string>(STEP_FAILURE_POLICIES);

const UNSAFE_FIELD_CHARS = /[^a-zA-Z0-9_.]/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateConditionConfig(config: unknown, stepId?: string): PipelineValidationIssue[] {
  const issues: PipelineValidationIssue[] = [];
  if (!isPlainObject(config)) {
    issues.push({ code: 'condition_not_object', message: 'Condition config must be an object.', stepId });
    return issues;
  }

  const field = config.field;
  const operator = config.operator;

  if (typeof field !== 'string' || !field.trim()) {
    issues.push({ code: 'condition_field_required', message: 'Condition field is required.', stepId });
  } else if (UNSAFE_FIELD_CHARS.test(field) || field.includes('__proto__') || field.includes('prototype')) {
    issues.push({
      code: 'condition_field_unsafe',
      message: 'Condition field may only contain letters, numbers, underscore, and dots.',
      stepId,
    });
  } else if (field.length > 120) {
    issues.push({ code: 'condition_field_too_long', message: 'Condition field is too long.', stepId });
  }

  if (typeof operator !== 'string' || !OP_SET.has(operator)) {
    issues.push({
      code: 'condition_operator_invalid',
      message: `Unsupported condition operator: ${String(operator)}`,
      stepId,
    });
  }

  if ('expression' in config || 'code' in config || 'js' in config || 'eval' in config) {
    issues.push({
      code: 'condition_unsafe_keys',
      message: 'Arbitrary code / expression keys are not allowed in condition config.',
      stepId,
    });
  }

  return issues;
}

function detectCycles(steps: WorkflowStepDefinition[]): string[] | null {
  const byId = new Map(steps.map(s => [s.id, s]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function dfs(id: string): string[] | null {
    if (visited.has(id)) return null;
    if (visiting.has(id)) {
      const idx = stack.indexOf(id);
      return [...stack.slice(idx), id];
    }
    visiting.add(id);
    stack.push(id);
    const step = byId.get(id);
    for (const dep of step?.dependsOn || []) {
      const cycle = dfs(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const step of steps) {
    const cycle = dfs(step.id);
    if (cycle) return cycle;
  }
  return null;
}

export function validateWorkflowPipeline(input: unknown): PipelineValidationResult {
  const issues: PipelineValidationIssue[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ code: 'pipeline_not_object', message: 'Pipeline must be an object.' }] };
  }

  const version = input.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    issues.push({ code: 'pipeline_version_invalid', message: 'pipeline.version must be an integer >= 1.' });
  }

  if (!Array.isArray(input.steps)) {
    issues.push({ code: 'pipeline_steps_required', message: 'pipeline.steps must be an array.' });
    return { ok: false, issues };
  }

  if (input.steps.length === 0) {
    issues.push({ code: 'pipeline_steps_empty', message: 'pipeline.steps must not be empty.' });
  }

  const steps: WorkflowStepDefinition[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < input.steps.length; i++) {
    const raw = input.steps[i];
    if (!isPlainObject(raw)) {
      issues.push({ code: 'step_not_object', message: `Step at index ${i} must be an object.` });
      continue;
    }

    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) {
      issues.push({ code: 'step_id_required', message: `Step at index ${i} requires id.`, stepId: undefined });
    } else if (seenIds.has(id)) {
      issues.push({ code: 'step_id_duplicate', message: `Duplicate step id: ${id}`, stepId: id });
    } else {
      seenIds.add(id);
    }

    const type = raw.type;
    if (typeof type !== 'string' || !STEP_TYPE_SET.has(type)) {
      issues.push({
        code: 'step_type_invalid',
        message: `Unsupported step type: ${String(type)}`,
        stepId: id || undefined,
      });
    }

    if (raw.enabled != null && typeof raw.enabled !== 'boolean') {
      issues.push({ code: 'step_enabled_invalid', message: 'enabled must be boolean.', stepId: id || undefined });
    }

    if (raw.dependsOn != null) {
      if (!Array.isArray(raw.dependsOn) || raw.dependsOn.some(d => typeof d !== 'string')) {
        issues.push({
          code: 'step_depends_on_invalid',
          message: 'dependsOn must be an array of strings.',
          stepId: id || undefined,
        });
      }
    }

    if (raw.executionTarget != null && (typeof raw.executionTarget !== 'string' || !TARGET_SET.has(raw.executionTarget))) {
      issues.push({
        code: 'step_execution_target_invalid',
        message: `Invalid executionTarget: ${String(raw.executionTarget)}`,
        stepId: id || undefined,
      });
    }

    if (raw.retry != null) {
      if (!isPlainObject(raw.retry)) {
        issues.push({ code: 'step_retry_invalid', message: 'retry must be an object.', stepId: id || undefined });
      } else {
        if (raw.retry.onFailure != null && !FAIL_SET.has(String(raw.retry.onFailure))) {
          issues.push({
            code: 'step_on_failure_invalid',
            message: `Invalid onFailure: ${String(raw.retry.onFailure)}`,
            stepId: id || undefined,
          });
        }
      }
    }

    if (type === 'condition') {
      issues.push(...validateConditionConfig(raw.config, id || undefined));
    }

    if (id && typeof type === 'string' && STEP_TYPE_SET.has(type)) {
      steps.push({
        id,
        type: type as WorkflowStepType,
        enabled: raw.enabled !== false,
        dependsOn: Array.isArray(raw.dependsOn) ? (raw.dependsOn as string[]) : [],
        config: isPlainObject(raw.config) ? raw.config : {},
        executionTarget: (raw.executionTarget as WorkflowStepDefinition['executionTarget']) || 'either',
        retry: isPlainObject(raw.retry) ? (raw.retry as WorkflowStepDefinition['retry']) : undefined,
      });
    }
  }

  for (const step of steps) {
    for (const dep of step.dependsOn || []) {
      if (!seenIds.has(dep)) {
        issues.push({
          code: 'step_dependency_missing',
          message: `Step "${step.id}" depends on missing step "${dep}".`,
          stepId: step.id,
        });
      }
      if (dep === step.id) {
        issues.push({
          code: 'step_self_dependency',
          message: `Step "${step.id}" cannot depend on itself.`,
          stepId: step.id,
        });
      }
    }
  }

  const cycle = detectCycles(steps);
  if (cycle) {
    issues.push({
      code: 'pipeline_cycle',
      message: `Circular dependency detected: ${cycle.join(' → ')}`,
    });
  }

  return { ok: issues.length === 0, issues };
}

export function assertValidPipeline(input: unknown): WorkflowPipelineDefinition {
  const result = validateWorkflowPipeline(input);
  if (!result.ok) {
    const detail = result.issues.map(i => i.message).join('; ');
    throw new Error(`Invalid pipeline: ${detail}`);
  }
  const obj = input as WorkflowPipelineDefinition;
  return {
    version: obj.version,
    steps: obj.steps.map(s => ({
      ...s,
      enabled: s.enabled !== false,
      dependsOn: s.dependsOn || [],
      config: s.config || {},
      executionTarget: s.executionTarget || 'either',
    })),
    defaults: obj.defaults,
  };
}

export function parseConditionConfig(config: unknown): ConditionConfig {
  const issues = validateConditionConfig(config);
  if (issues.length) {
    throw new Error(issues.map(i => i.message).join('; '));
  }
  const c = config as ConditionConfig;
  return { field: c.field, operator: c.operator, value: c.value };
}
