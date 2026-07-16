import { workflowStepHandlers } from '../steps';
import type { WorkflowStepHandler } from '../steps/stepContract';

export function getHandler(type: string): WorkflowStepHandler | undefined {
  return workflowStepHandlers.get(type);
}

export function requireHandler(type: string): WorkflowStepHandler {
  const handler = getHandler(type);
  if (!handler) {
    throw new Error(`No workflow step handler registered for type: ${type}`);
  }
  return handler;
}
