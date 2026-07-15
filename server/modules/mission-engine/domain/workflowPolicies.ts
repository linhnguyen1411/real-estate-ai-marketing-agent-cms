/**
 * Mission workflow policies — failure handling + legacy default pipeline.
 */

import type { WorkflowPipelineDefinition, StepFailurePolicy } from './workflowTypes';

export function resolveFailurePolicy(
  stepOnFailure: StepFailurePolicy | undefined,
  pipelineDefault: StepFailurePolicy | undefined,
  stepType: string,
): StepFailurePolicy {
  if (stepOnFailure) return stepOnFailure;
  if (pipelineDefault) return pipelineDefault;
  // Defaults by category
  if (stepType === 'notify_telegram' || stepType === 'notify_cms') return 'continue';
  if (stepType === 'spam_filter') return 'stop_workflow';
  if (stepType === 'create_lead_intelligence' || stepType === 'create_external_inventory_candidate') {
    return 'stop_workflow';
  }
  return 'continue';
}

/** Legacy Source Run / Mission without pipeline → spam → extract → classify → finding → notify. */
export function buildDefaultLeadPipeline(overrides?: {
  minScore?: number;
  notifyScore?: number;
  allowedClassifications?: string[];
}): WorkflowPipelineDefinition {
  const allowedClassifications = overrides?.allowedClassifications || [
    'buyer',
    'renter',
    'investor',
  ];
  return {
    version: 1,
    steps: [
      {
        id: 'spam',
        type: 'spam_filter',
        enabled: true,
        executionTarget: 'either',
        config: {},
        retry: { maxAttempts: 2, onFailure: 'stop_workflow' },
      },
      {
        id: 'extract',
        type: 'extract_structured_data',
        enabled: true,
        dependsOn: ['spam'],
        executionTarget: 'vps',
      },
      {
        id: 'classify',
        type: 'classify_subject',
        enabled: true,
        dependsOn: ['extract'],
        executionTarget: 'vps',
        config: { allowedClassifications, allowedActors: ['demand_side'] },
      },
      {
        id: 'finding',
        type: 'create_lead_intelligence',
        enabled: true,
        dependsOn: ['classify'],
        executionTarget: 'vps',
        config: { minScore: overrides?.minScore ?? 50 },
        retry: { maxAttempts: 2, onFailure: 'stop_workflow' },
      },
      {
        id: 'notify_cms',
        type: 'notify_cms',
        enabled: true,
        dependsOn: ['finding'],
        executionTarget: 'vps',
        config: { minimumScore: overrides?.notifyScore ?? 70 },
        retry: { onFailure: 'continue' },
      },
      {
        id: 'telegram',
        type: 'notify_telegram',
        enabled: true,
        dependsOn: ['finding'],
        executionTarget: 'vps',
        config: { minimumScore: overrides?.notifyScore ?? 70 },
        retry: { onFailure: 'continue' },
      },
    ],
    defaults: { maxAttempts: 2, onFailure: 'continue' },
  };
}

/** Hash-stable snapshot identity for job payloads (not cryptographic). */
export function pipelineSnapshotHash(pipeline: WorkflowPipelineDefinition): string {
  const normalized = JSON.stringify({
    version: pipeline.version,
    steps: pipeline.steps.map(s => ({
      id: s.id,
      type: s.type,
      enabled: s.enabled !== false,
      dependsOn: s.dependsOn || [],
      config: s.config || {},
      executionTarget: s.executionTarget || 'either',
    })),
  });
  let h = 0;
  for (let i = 0; i < normalized.length; i++) {
    h = (Math.imul(31, h) + normalized.charCodeAt(i)) | 0;
  }
  return `p${pipeline.version}_${(h >>> 0).toString(16)}`;
}

export function getPathValue(root: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function evaluateCondition(
  operator: string,
  left: unknown,
  right: unknown,
): boolean {
  switch (operator) {
    case 'exists':
      return left !== undefined && left !== null && left !== '';
    case 'equals':
      return left === right;
    case 'not_equals':
      return left !== right;
    case 'in':
      return Array.isArray(right) && right.includes(left);
    case 'not_in':
      return Array.isArray(right) && !right.includes(left);
    case 'greater_than':
      return Number(left) > Number(right);
    case 'greater_or_equal':
      return Number(left) >= Number(right);
    case 'less_than':
      return Number(left) < Number(right);
    case 'less_or_equal':
      return Number(left) <= Number(right);
    case 'contains':
      if (typeof left === 'string') return left.includes(String(right ?? ''));
      if (Array.isArray(left)) return left.includes(right);
      return false;
    default:
      return false;
  }
}
