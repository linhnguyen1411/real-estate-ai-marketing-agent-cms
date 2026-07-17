/**
 * Stub actions — registered in the Action Framework, not yet implemented.
 * Do not execute against a live browser.
 */

import type {
  AutomationAction,
  AutomationActionContext,
  AutomationActionEvidence,
  AutomationActionKey,
  AutomationActionResult,
} from './types';

function notImplemented(key: AutomationActionKey, phase: string): never {
  throw new Error(`Automation action "${key}" is not implemented (${phase})`);
}

function makeStub(key: AutomationActionKey, label: string): AutomationAction {
  return {
    key,
    label,
    async prepare(_ctx: AutomationActionContext): Promise<AutomationActionResult> {
      notImplemented(key, 'prepare');
    },
    async execute(_ctx: AutomationActionContext): Promise<AutomationActionResult> {
      notImplemented(key, 'execute');
    },
    async verify(_ctx: AutomationActionContext): Promise<AutomationActionResult> {
      notImplemented(key, 'verify');
    },
    async captureEvidence(_ctx: AutomationActionContext): Promise<AutomationActionEvidence> {
      notImplemented(key, 'captureEvidence');
    },
    async cleanup(_ctx: AutomationActionContext): Promise<AutomationActionResult> {
      notImplemented(key, 'cleanup');
    },
  };
}

export const CommentAction = makeStub('comment', 'Comment');
export const ReplyAction = makeStub('reply', 'Reply');
export const ReactAction = makeStub('react', 'React');
export const JoinGroupAction = makeStub('join_group', 'Join Group');
export const FollowAction = makeStub('follow', 'Follow');
export const InviteAction = makeStub('invite', 'Invite');
export const MessageAction = makeStub('message', 'Message');
/** Placeholder until a destination binds PublishAction to a host. */
export const PublishActionStub = makeStub('publish', 'Publish');

export const STUB_AUTOMATION_ACTIONS: AutomationAction[] = [
  PublishActionStub,
  CommentAction,
  ReplyAction,
  ReactAction,
  JoinGroupAction,
  FollowAction,
  InviteAction,
  MessageAction,
];
