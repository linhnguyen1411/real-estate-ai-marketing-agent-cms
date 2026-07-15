/**
 * Topological helpers for workflow graphs.
 */

import type { WorkflowPipelineDefinition, WorkflowStepDefinition } from './workflowTypes';

export function enabledSteps(pipeline: WorkflowPipelineDefinition): WorkflowStepDefinition[] {
  return pipeline.steps.filter(s => s.enabled !== false);
}

/** Kahn-style topological order of enabled steps (stable by declaration order among ties). */
export function topologicalSortSteps(pipeline: WorkflowPipelineDefinition): WorkflowStepDefinition[] {
  const steps = enabledSteps(pipeline);
  const ids = new Set(steps.map(s => s.id));
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const s of steps) {
    indeg.set(s.id, 0);
    dependents.set(s.id, []);
  }

  for (const s of steps) {
    for (const dep of s.dependsOn || []) {
      if (!ids.has(dep)) continue;
      indeg.set(s.id, (indeg.get(s.id) || 0) + 1);
      dependents.get(dep)!.push(s.id);
    }
  }

  const queue = steps.filter(s => (indeg.get(s.id) || 0) === 0).map(s => s.id);
  const order: string[] = [];
  const byId = new Map(steps.map(s => [s.id, s]));

  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const child of dependents.get(id) || []) {
      const next = (indeg.get(child) || 0) - 1;
      indeg.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  if (order.length !== steps.length) {
    throw new Error('Cannot topological-sort pipeline (cycle or missing dep).');
  }

  return order.map(id => byId.get(id)!);
}

/** Downstream transitive dependents (enabled only). */
export function collectDownstreamStepIds(
  pipeline: WorkflowPipelineDefinition,
  fromStepId: string,
): Set<string> {
  const steps = enabledSteps(pipeline);
  const children = new Map<string, string[]>();
  for (const s of steps) {
    for (const dep of s.dependsOn || []) {
      if (!children.has(dep)) children.set(dep, []);
      children.get(dep)!.push(s.id);
    }
  }

  const out = new Set<string>();
  const stack = [...(children.get(fromStepId) || [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of children.get(id) || []) stack.push(c);
  }
  return out;
}

export function stepsReadyToRun(
  pipeline: WorkflowPipelineDefinition,
  completedOrSkipped: Set<string>,
  blocked: Set<string>,
): WorkflowStepDefinition[] {
  return topologicalSortSteps(pipeline).filter(step => {
    if (completedOrSkipped.has(step.id) || blocked.has(step.id)) return false;
    return (step.dependsOn || []).every(dep => completedOrSkipped.has(dep) || blocked.has(dep));
  });
}
