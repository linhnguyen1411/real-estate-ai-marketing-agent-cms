import type { FacebookNormalizedEvent } from './types';

function parseMessagingEvent(pageId: string, event: Record<string, unknown>): FacebookNormalizedEvent[] {
  const results: FacebookNormalizedEvent[] = [];
  const sender = event.sender as { id?: string } | undefined;
  const recipient = event.recipient as { id?: string } | undefined;
  const psid = sender?.id;
  const timestamp = Number(event.timestamp || Date.now());

  if (event.message && typeof event.message === 'object') {
    const message = event.message as Record<string, unknown>;
    results.push({
      kind: 'messenger_inbound',
      pageId,
      psid,
      senderId: psid,
      recipientPageId: recipient?.id || pageId,
      messageId: typeof message.mid === 'string' ? message.mid : undefined,
      text: typeof message.text === 'string' ? message.text : undefined,
      attachments: Array.isArray(message.attachments) ? message.attachments : undefined,
      timestamp,
      raw: event,
    });
  }

  if (event.postback && typeof event.postback === 'object') {
    const postback = event.postback as Record<string, unknown>;
    results.push({
      kind: 'messenger_postback',
      pageId,
      psid,
      senderId: psid,
      recipientPageId: recipient?.id || pageId,
      text: typeof postback.title === 'string' ? postback.title : undefined,
      postbackPayload: typeof postback.payload === 'string' ? postback.payload : undefined,
      timestamp,
      raw: event,
    });
  }

  if (event.optin && typeof event.optin === 'object') {
    results.push({
      kind: 'messenger_optin',
      pageId,
      psid,
      senderId: psid,
      recipientPageId: recipient?.id || pageId,
      timestamp,
      raw: event,
    });
  }

  return results;
}

function parseFeedChange(pageId: string, value: Record<string, unknown>): FacebookNormalizedEvent[] {
  const item = String(value.item || '');
  const verb = String(value.verb || '');
  const timestamp = value.created_time
    ? Number(value.created_time) * 1000
    : Date.now();

  if (item === 'comment' && (verb === 'add' || verb === 'edited')) {
    const from = value.from as { id?: string; name?: string } | undefined;
    return [{
      kind: 'page_comment',
      pageId,
      psid: from?.id,
      senderId: from?.id,
      senderName: from?.name,
      postId: typeof value.post_id === 'string' ? value.post_id : typeof value.parent_id === 'string' ? value.parent_id : undefined,
      commentId: typeof value.comment_id === 'string' ? value.comment_id : undefined,
      parentId: typeof value.parent_id === 'string' ? value.parent_id : undefined,
      text: typeof value.message === 'string' ? value.message : undefined,
      canPrivateReply: true,
      timestamp,
      raw: value,
    }];
  }

  if (item === 'reaction' && verb === 'add') {
    const from = value.from as { id?: string; name?: string } | undefined;
    return [{
      kind: 'page_reaction',
      pageId,
      psid: from?.id,
      senderId: from?.id,
      senderName: from?.name,
      postId: typeof value.post_id === 'string' ? value.post_id : undefined,
      commentId: typeof value.comment_id === 'string' ? value.comment_id : undefined,
      reactionType: typeof value.reaction_type === 'string' ? value.reaction_type : undefined,
      canPrivateReply: false,
      timestamp,
      raw: value,
    }];
  }

  if (item === 'like' || (item === 'reaction' && value.reaction_type === 'like')) {
    const from = value.from as { id?: string; name?: string } | undefined;
    return [{
      kind: 'page_reaction',
      pageId,
      psid: from?.id,
      senderId: from?.id,
      senderName: from?.name,
      postId: typeof value.post_id === 'string' ? value.post_id : undefined,
      reactionType: 'like',
      canPrivateReply: false,
      timestamp,
      raw: value,
    }];
  }

  return [{
    kind: 'unknown',
    pageId,
    timestamp,
    raw: value,
  }];
}

export function parseFacebookWebhookPayload(payload: unknown): FacebookNormalizedEvent[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as Record<string, unknown>;
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const events: FacebookNormalizedEvent[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const entryObj = entry as Record<string, unknown>;
    const pageId = String(entryObj.id || '');

    const messaging = Array.isArray(entryObj.messaging) ? entryObj.messaging : [];
    for (const item of messaging) {
      if (item && typeof item === 'object') {
        events.push(...parseMessagingEvent(pageId, item as Record<string, unknown>));
      }
    }

    const changes = Array.isArray(entryObj.changes) ? entryObj.changes : [];
    for (const change of changes) {
      if (!change || typeof change !== 'object') continue;
      const changeObj = change as Record<string, unknown>;
      if (changeObj.value && typeof changeObj.value === 'object') {
        events.push(...parseFeedChange(pageId, changeObj.value as Record<string, unknown>));
      }
    }
  }

  return events;
}

export function inferWebhookEventType(payload: unknown): string | null {
  const events = parseFacebookWebhookPayload(payload);
  if (!events.length) return null;
  return events.map(event => event.kind).join(',');
}
