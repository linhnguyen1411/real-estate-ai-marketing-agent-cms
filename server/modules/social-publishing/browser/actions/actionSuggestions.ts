/**
 * AI suggestion helpers for browser actions.
 * Never executes browser actions — human approval remains mandatory.
 */

import type { AutomationActionKey } from './types';

export type BrowserActionSuggestion = {
  action: Exclude<AutomationActionKey, 'publish'>;
  text?: string;
  reaction?: string;
  targetUrl?: string;
  rationale: string;
  /** Always true — callers must not auto-execute. */
  requiresHumanApproval: true;
  autoExecute: false;
};

function base(
  action: BrowserActionSuggestion['action'],
  extra: Partial<BrowserActionSuggestion> & { rationale: string },
): BrowserActionSuggestion {
  return {
    action,
    requiresHumanApproval: true,
    autoExecute: false,
    ...extra,
  };
}

export function suggestComment(input: {
  topic?: string;
  tone?: string;
  draftText?: string;
  targetUrl?: string;
}): BrowserActionSuggestion {
  const text =
    input.draftText?.trim() ||
    `Curious about ${input.topic || 'this'} — happy to share more details if useful.`;
  return base('comment', {
    text,
    targetUrl: input.targetUrl,
    rationale: `Suggested comment (${input.tone || 'neutral'}) — awaiting human approval`,
  });
}

export function suggestReply(input: {
  parentComment?: string;
  draftText?: string;
  targetUrl?: string;
}): BrowserActionSuggestion {
  const text =
    input.draftText?.trim() ||
    `Thanks for sharing — ${input.parentComment ? 'noted your point.' : 'happy to help.'}`;
  return base('reply', {
    text,
    targetUrl: input.targetUrl,
    rationale: 'Suggested reply — awaiting human approval',
  });
}

export function suggestMessage(input: {
  topic?: string;
  draftText?: string;
  targetUrl?: string;
}): BrowserActionSuggestion {
  const text =
    input.draftText?.trim() ||
    `Hi — following up on ${input.topic || 'your listing'}. Happy to connect.`;
  return base('message', {
    text,
    targetUrl: input.targetUrl,
    rationale: 'Suggested DM — awaiting human approval',
  });
}

export function suggestReact(input: {
  reaction?: string;
  targetUrl?: string;
}): BrowserActionSuggestion {
  return base('react', {
    reaction: input.reaction || 'Like',
    targetUrl: input.targetUrl,
    rationale: 'Suggested reaction — awaiting human approval',
  });
}

export function suggestFollow(input: { targetUrl?: string }): BrowserActionSuggestion {
  return base('follow', {
    targetUrl: input.targetUrl,
    rationale: 'Suggested follow — awaiting human approval',
  });
}

export function suggestJoinGroup(input: { targetUrl?: string }): BrowserActionSuggestion {
  return base('join_group', {
    targetUrl: input.targetUrl,
    rationale: 'Suggested join group — awaiting human approval',
  });
}

export function suggestInvite(input: {
  targetUrl?: string;
  draftText?: string;
}): BrowserActionSuggestion {
  return base('invite', {
    text: input.draftText,
    targetUrl: input.targetUrl,
    rationale: 'Suggested invite — awaiting human approval',
  });
}

/** Map a free-form intent to a suggestion (still never auto-executes). */
export function suggestBrowserAction(input: {
  intent: Exclude<AutomationActionKey, 'publish'>;
  topic?: string;
  draftText?: string;
  reaction?: string;
  targetUrl?: string;
}): BrowserActionSuggestion {
  switch (input.intent) {
    case 'comment':
      return suggestComment(input);
    case 'reply':
      return suggestReply(input);
    case 'message':
      return suggestMessage(input);
    case 'react':
      return suggestReact(input);
    case 'follow':
      return suggestFollow(input);
    case 'join_group':
      return suggestJoinGroup(input);
    case 'invite':
      return suggestInvite(input);
    default: {
      const _exhaustive: never = input.intent;
      return _exhaustive;
    }
  }
}
