/**
 * Automation Engine — workflow catalog types.
 * Additive facade; does not replace Mission Runtime execution.
 */

import type { WorkflowPipelineDefinition } from '../mission-engine/domain/workflowTypes';
import type { AutomationActionKey } from '../social-publishing/browser/actions/types';
import type { DestinationKey } from '../social-publishing/browser/types';

export const AUTOMATION_WORKFLOW_KEYS = [
  'scan-content',
  'publish-content',
  'auto-comment',
  'auto-message',
  'auto-follow',
  'auto-invite',
  'auto-react',
] as const;

export type AutomationWorkflowKey = (typeof AUTOMATION_WORKFLOW_KEYS)[number];

export type AutomationWorkflowKind = 'scan' | 'publish' | 'action';

export interface AutomationWorkflowRegistration {
  key: AutomationWorkflowKey;
  label: string;
  kind: AutomationWorkflowKind;
  /** Mission template key when wired through Mission Engine */
  missionTemplateKey?: string | null;
  /** Primary browser action when action-based */
  actionKey?: AutomationActionKey | null;
  /** Optional default destination (publish / future actions) */
  defaultDestinationKey?: DestinationKey | null;
  /** Pipeline snapshot reference (publish); scan uses content workflows */
  pipeline?: WorkflowPipelineDefinition | null;
  implemented: boolean;
  description?: string;
}
