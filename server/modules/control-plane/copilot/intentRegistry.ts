/**
 * Intent Strategy registry — handlers register themselves; no giant switch in engine.
 */

import type {
  ClassifiedIntent,
  CopilotReply,
  CopilotSessionContext,
} from './types';
import type { CopilotControlPlanePort } from './ports';

export type IntentHandler = {
  name: string;
  /** Whether this handler can run the classified intent */
  supports(intent: ClassifiedIntent): boolean;
  execute(input: {
    intent: ClassifiedIntent;
    ctx: CopilotSessionContext;
    port: CopilotControlPlanePort;
    text: string;
  }): Promise<CopilotReply>;
};

export function createIntentRegistry() {
  const handlers: IntentHandler[] = [];

  return {
    register(handler: IntentHandler) {
      handlers.push(handler);
    },
    list() {
      return [...handlers];
    },
    resolve(intent: ClassifiedIntent): IntentHandler | null {
      return handlers.find(h => h.supports(intent)) || null;
    },
  };
}

export type IntentRegistry = ReturnType<typeof createIntentRegistry>;
