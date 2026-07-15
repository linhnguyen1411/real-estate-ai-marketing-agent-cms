import { evaluateCondition, getPathValue } from '../domain/workflowPolicies';
import { parseConditionConfig } from '../domain/workflowValidation';
import type { WorkflowStepHandler } from './stepContract';

export const conditionStep: WorkflowStepHandler = {
  type: 'condition',
  async execute(ctx) {
    const condition = parseConditionConfig(ctx.step.config || {});
    const evalRoot = {
      ...ctx.previousStepOutputs,
      classification: flattenClassification(ctx.previousStepOutputs),
    };
    const left = getPathValue(evalRoot, condition.field);
    const passed = evaluateCondition(condition.operator, left, condition.value);

    return {
      status: 'completed',
      output: {
        conditionPassed: passed,
        field: condition.field,
        operator: condition.operator,
        left: compactValue(left),
      },
    };
  },
};

/** Nested object so DSL field `classification.finalScore` resolves. */
function flattenClassification(outputs: Record<string, unknown>): Record<string, unknown> {
  for (const val of Object.values(outputs)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    const o = val as Record<string, unknown>;
    if ('finalScore' in o || 'classification' in o || 'findingCreated' in o) {
      return {
        ...o,
        label: o.classification,
        finalScore: o.finalScore,
      };
    }
  }
  return {};
}

function compactValue(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, 120);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value == null) return value;
  return '[object]';
}
