/**
 * Automation Action Framework — platform-agnostic browser actions.
 * Publish is one action; Comment/Reply/React/… share the same contract.
 */

import type {
  BrowserDestinationContext,
  BrowserDestinationEvidence,
  BrowserDestinationPhaseResult,
} from '../types';

export const AUTOMATION_ACTION_KEYS = [
  'publish',
  'comment',
  'reply',
  'react',
  'join_group',
  'follow',
  'invite',
  'message',
] as const;

export type AutomationActionKey = (typeof AUTOMATION_ACTION_KEYS)[number];

/** Context for an action run — currently aliases destination publish context. */
export type AutomationActionContext = BrowserDestinationContext;

export type AutomationActionResult = BrowserDestinationPhaseResult;

export type AutomationActionEvidence = BrowserDestinationEvidence;

/**
 * Canonical action lifecycle.
 * Destination adapters supply selectors/navigation/capabilities;
 * Actions decide what to do with the page.
 */
export interface AutomationAction {
  readonly key: AutomationActionKey;
  readonly label: string;

  prepare(ctx: AutomationActionContext): Promise<AutomationActionResult>;
  execute(ctx: AutomationActionContext): Promise<AutomationActionResult>;
  verify(ctx: AutomationActionContext): Promise<AutomationActionResult>;
  captureEvidence(ctx: AutomationActionContext): Promise<AutomationActionEvidence>;
  cleanup(ctx: AutomationActionContext): Promise<AutomationActionResult>;
}

export interface AutomationActionRegistration {
  key: AutomationActionKey;
  label: string;
  action: AutomationAction;
  /** false = registered stub, not yet implemented */
  implemented: boolean;
}
