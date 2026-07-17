/**
 * Automation Engine facade.
 *
 * Unifies discovery of:
 * - Mission / Worker / Browser runtimes (by reference — not reimplemented)
 * - Destination Registry
 * - Action Registry
 * - Workflow Registry
 *
 * Does not change Mission Runtime, Worker Runtime, Queue, or API behavior.
 */

import { ActionRegistry } from './actionRegistryFacade';
import { DestinationRegistry } from './destinationRegistryFacade';
import { WorkflowRegistry } from './workflowRegistry';
import type { AutomationWorkflowKey, AutomationWorkflowRegistration } from './types';

export const AutomationEngine = {
  /** Workflow catalog (scan-content, publish-content, future actions) */
  workflows: WorkflowRegistry,

  /** Browser action catalog (publish, comment, …) */
  actions: ActionRegistry,

  /** Browser destination catalog (facebook_timeline, …) */
  destinations: DestinationRegistry,

  /**
   * Resolve a registered workflow. Throws if missing or not implemented
   * when `requireImplemented` is true.
   */
  resolveWorkflow(
    key: AutomationWorkflowKey,
    options?: { requireImplemented?: boolean },
  ): AutomationWorkflowRegistration {
    const reg = WorkflowRegistry.get(key);
    if (!reg) {
      throw new Error(`Automation workflow not registered: ${key}`);
    }
    if (options?.requireImplemented && !reg.implemented) {
      throw new Error(`Automation workflow not implemented: ${key}`);
    }
    return reg;
  },

  /** Snapshot of engine composition (docs / diagnostics). */
  describe() {
    return {
      name: 'AutomationEngine',
      runtimes: {
        mission: 'server/modules/mission-engine',
        worker: 'server/agent-worker',
        browser: 'server/agent-worker/browserManager',
      },
      registries: {
        workflows: WorkflowRegistry.list().map(w => ({
          key: w.key,
          implemented: w.implemented,
          kind: w.kind,
        })),
        actions: ActionRegistry.list().map(a => ({
          key: a.key,
          implemented: a.implemented,
        })),
        destinations: DestinationRegistry.list().map(d => ({
          key: d.key,
          label: d.label,
        })),
      },
    };
  },
};

export type AutomationEngineFacade = typeof AutomationEngine;
