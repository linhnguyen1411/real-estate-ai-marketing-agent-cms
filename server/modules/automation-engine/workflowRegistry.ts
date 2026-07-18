/**
 * WorkflowRegistry — single catalog for automation workflows.
 * Scan + Publish register here; future actions register the same way.
 */

import {
  PUBLISH_BROWSER_CONTENT_PIPELINE,
  PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY,
} from '../mission-engine/domain/publishMissionTemplate';
import type { AutomationWorkflowKey, AutomationWorkflowRegistration } from './types';
import { AUTOMATION_WORKFLOW_KEYS } from './types';

const registrations = new Map<AutomationWorkflowKey, AutomationWorkflowRegistration>();

function register(reg: AutomationWorkflowRegistration): void {
  registrations.set(reg.key, reg);
}

function bootstrapDefaults(): void {
  if (registrations.size > 0) return;

  register({
    key: 'scan-content',
    label: 'Scan Content',
    kind: 'scan',
    missionTemplateKey: null,
    actionKey: null,
    pipeline: null,
    implemented: true,
    description:
      'Source scan → collect → Mission content workflow (executeContentWorkflow). Worker job type scan_source.',
  });

  register({
    key: 'publish-content',
    label: 'Publish Content',
    kind: 'publish',
    missionTemplateKey: PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY,
    actionKey: 'publish',
    defaultDestinationKey: 'facebook_timeline',
    pipeline: structuredClone(PUBLISH_BROWSER_CONTENT_PIPELINE),
    implemented: true,
    description:
      'SocialPublishJob → MissionRun → executePublishWorkflow → PublishAction → DestinationAdapter.',
  });

  const future: Array<Omit<AutomationWorkflowRegistration, 'implemented' | 'pipeline'>> = [
    {
      key: 'auto-comment',
      label: 'Auto Comment',
      kind: 'action',
      actionKey: 'comment',
      description: 'Future: comment via CommentAction + Destination Registry.',
    },
    {
      key: 'auto-message',
      label: 'Auto Message',
      kind: 'action',
      actionKey: 'message',
      description: 'Future: messaging via MessageAction.',
    },
    {
      key: 'auto-follow',
      label: 'Auto Follow',
      kind: 'action',
      actionKey: 'follow',
      description: 'Future: follow via FollowAction.',
    },
    {
      key: 'auto-invite',
      label: 'Auto Invite',
      kind: 'action',
      actionKey: 'invite',
      description: 'Future: invite via InviteAction.',
    },
    {
      key: 'auto-react',
      label: 'Auto React',
      kind: 'action',
      actionKey: 'react',
      description: 'Future: react via ReactAction.',
    },
  ];

  for (const item of future) {
    register({
      ...item,
      pipeline: null,
      missionTemplateKey: item.missionTemplateKey ?? null,
      implemented: false,
    });
  }
}

export function registerAutomationWorkflow(reg: AutomationWorkflowRegistration): void {
  bootstrapDefaults();
  register(reg);
}

export function getAutomationWorkflow(
  key: AutomationWorkflowKey,
): AutomationWorkflowRegistration | undefined {
  bootstrapDefaults();
  const reg = registrations.get(key);
  if (!reg) return undefined;
  return {
    ...reg,
    pipeline: reg.pipeline ? structuredClone(reg.pipeline) : null,
  };
}

export function listAutomationWorkflows(): AutomationWorkflowRegistration[] {
  bootstrapDefaults();
  return AUTOMATION_WORKFLOW_KEYS.map(key => {
    const reg = getAutomationWorkflow(key);
    if (!reg) throw new Error(`Automation workflow not registered: ${key}`);
    return reg;
  });
}

export function isAutomationWorkflowImplemented(key: AutomationWorkflowKey): boolean {
  return getAutomationWorkflow(key)?.implemented === true;
}

export function resolveImplementedWorkflows(): AutomationWorkflowRegistration[] {
  return listAutomationWorkflows().filter(w => w.implemented);
}

/** Test-only */
export function _resetAutomationWorkflowRegistryForTests(): void {
  registrations.clear();
}

export const WorkflowRegistry = {
  register: registerAutomationWorkflow,
  get: getAutomationWorkflow,
  list: listAutomationWorkflows,
  isImplemented: isAutomationWorkflowImplemented,
  listImplemented: resolveImplementedWorkflows,
  _resetForTests: _resetAutomationWorkflowRegistryForTests,
};
