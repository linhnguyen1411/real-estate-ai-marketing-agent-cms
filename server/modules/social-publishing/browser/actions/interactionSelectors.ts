/**
 * Destination-owned interaction selectors (DOM only).
 * Actions consume these keys; destinations may override defaults.
 * No action-name orchestration here — only CSS / aria candidates.
 */

export type InteractionSelectorMap = {
  commentComposer: string[];
  commentSubmit: string[];
  replyComposer: string[];
  replySubmit: string[];
  reactOpen: string[];
  /** Candidates for a named reaction (like / love / …). */
  reactOption: (reaction: string) => string[];
  messageComposer: string[];
  messageSend: string[];
  followButton: string[];
  joinGroupButton: string[];
  inviteButton: string[];
  inviteConfirm: string[];
};

/** Platform-agnostic defaults (aria / role patterns). Destinations may override. */
export const DEFAULT_INTERACTION_SELECTORS: InteractionSelectorMap = {
  commentComposer: [
    'div[aria-label*="Write a comment" i][contenteditable="true"]',
    'div[aria-label*="Comment" i][contenteditable="true"]',
    'div[role="textbox"][aria-label*="comment" i]',
    'form [contenteditable="true"]',
  ],
  commentSubmit: [
    'div[aria-label="Comment" i][role="button"]',
    'div[aria-label*="Post" i][role="button"]',
    '[data-testid="comment-submit"]',
  ],
  replyComposer: [
    'div[aria-label*="Reply" i][contenteditable="true"]',
    'div[role="textbox"][aria-label*="reply" i]',
    'div[aria-label*="Write a reply" i][contenteditable="true"]',
  ],
  replySubmit: [
    'div[aria-label="Reply" i][role="button"]',
    'div[aria-label*="Post" i][role="button"]',
  ],
  reactOpen: [
    'div[aria-label="Like" i][role="button"]',
    'div[aria-label*="React" i][role="button"]',
    '[aria-label="Like"]',
  ],
  reactOption: (reaction: string) => {
    const label = reaction.trim() || 'Like';
    return [
      `div[aria-label="${label}" i][role="button"]`,
      `div[aria-label*="${label}" i][role="button"]`,
      `[aria-label="${label}"]`,
    ];
  },
  messageComposer: [
    'div[aria-label*="Message" i][contenteditable="true"]',
    'div[role="textbox"][aria-label*="message" i]',
    'div[aria-label*="Aa" i][contenteditable="true"]',
  ],
  messageSend: [
    'div[aria-label="Press Enter to send" i][role="button"]',
    'div[aria-label*="Send" i][role="button"]',
    '[aria-label="Send"]',
  ],
  followButton: [
    'div[aria-label="Follow" i][role="button"]',
    'div[role="button"]:has-text("Follow")',
    '[aria-label="Follow"]',
  ],
  joinGroupButton: [
    'div[aria-label="Join group" i][role="button"]',
    'div[aria-label*="Join" i][role="button"]',
    'div[role="button"]:has-text("Join")',
  ],
  inviteButton: [
    'div[aria-label*="Invite" i][role="button"]',
    'div[role="button"]:has-text("Invite")',
  ],
  inviteConfirm: [
    'div[aria-label*="Send invites" i][role="button"]',
    'div[aria-label*="Confirm" i][role="button"]',
    'div[role="button"]:has-text("Send Invites")',
  ],
};
