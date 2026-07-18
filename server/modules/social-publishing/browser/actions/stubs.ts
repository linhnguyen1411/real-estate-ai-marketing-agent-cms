/**
 * Stub actions — bootstrap placeholders until a Destination binds real implementations.
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

export const CommentActionStub = makeStub('comment', 'Comment');
export const ReplyActionStub = makeStub('reply', 'Reply');
export const ReactActionStub = makeStub('react', 'React');
export const JoinGroupActionStub = makeStub('join_group', 'Join Group');
export const FollowActionStub = makeStub('follow', 'Follow');
export const InviteActionStub = makeStub('invite', 'Invite');
export const MessageActionStub = makeStub('message', 'Message');
/** Placeholder until a destination binds PublishAction to a host. */
export const PublishActionStub = makeStub('publish', 'Publish');

export const STUB_AUTOMATION_ACTIONS: AutomationAction[] = [
  PublishActionStub,
  CommentActionStub,
  ReplyActionStub,
  ReactActionStub,
  JoinGroupActionStub,
  FollowActionStub,
  InviteActionStub,
  MessageActionStub,
];
