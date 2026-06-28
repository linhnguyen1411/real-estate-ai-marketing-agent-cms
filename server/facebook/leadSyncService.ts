import type { FacebookNormalizedEvent } from './types';
import { analyzeIntent } from './intentDetector';
import { createFacebookInteraction, upsertFacebookContact } from './facebookDb';
import { syncIntentLead } from './leadSyncCore';

export async function syncCommentInteraction(event: FacebookNormalizedEvent) {
  const intent = analyzeIntent(event.text, 'comment');
  let contactId: string | undefined;

  if (event.psid) {
    const contact = await upsertFacebookContact({
      psid: event.psid,
      name: event.senderName,
      facebookUserId: event.senderId,
    });
    contactId = contact.id;
  }

  const interaction = await createFacebookInteraction({
    pageId: event.pageId,
    contactId,
    type: 'comment',
    postId: event.postId,
    commentId: event.commentId,
    text: event.text,
    status: 'new',
    intentTags: intent.tags,
    canPrivateReply: Boolean(event.canPrivateReply),
    rawPayload: event.raw,
  });

  let lead = null;
  if (intent.hasIntent && contactId) {
    lead = await syncIntentLead({
      event,
      contactId,
      sourceType: 'comment',
    });
  }

  return { interaction, lead };
}

export async function syncReactionInteraction(event: FacebookNormalizedEvent) {
  let contactId: string | undefined;
  if (event.psid) {
    const contact = await upsertFacebookContact({
      psid: event.psid,
      name: event.senderName,
      facebookUserId: event.senderId,
    });
    contactId = contact.id;
  }

  const interaction = await createFacebookInteraction({
    pageId: event.pageId,
    contactId,
    type: event.reactionType === 'like' ? 'like' : 'reaction',
    postId: event.postId,
    commentId: event.commentId,
    text: event.reactionType,
    status: 'new',
    canPrivateReply: false,
    rawPayload: event.raw,
  });

  return { interaction, lead: null };
}

export { syncIntentLead, createOrUpdateFacebookLead } from './leadSyncCore';
