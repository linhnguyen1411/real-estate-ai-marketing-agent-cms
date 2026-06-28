export type FacebookEventKind =
  | 'messenger_inbound'
  | 'messenger_postback'
  | 'page_comment'
  | 'page_reaction'
  | 'messenger_optin'
  | 'unknown';

export interface IntentDetectionResult {
  hasIntent: boolean;
  highIntent: boolean;
  tags: string[];
  score: number;
  phone: string | null;
  hasBudget: boolean;
}

export interface FacebookNormalizedEvent {
  kind: FacebookEventKind;
  pageId: string;
  psid?: string;
  senderId?: string;
  senderName?: string;
  recipientPageId?: string;
  messageId?: string;
  postId?: string;
  commentId?: string;
  parentId?: string;
  text?: string;
  attachments?: unknown[];
  reactionType?: string;
  postbackPayload?: string;
  canPrivateReply?: boolean;
  timestamp: number;
  raw: unknown;
}
