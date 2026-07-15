import type { WorkflowStepContext, WorkflowStepResult } from '../domain/workflowTypes';

export interface WorkflowStepHandler {
  type: string;
  execute(ctx: WorkflowStepContext): Promise<WorkflowStepResult>;
}
