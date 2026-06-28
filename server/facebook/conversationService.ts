import type { FacebookNormalizedEvent } from './types';
import {
  createFacebookMessage,
  upsertFacebookContact,
  upsertMessengerConversation,
} from './facebookDb';

export async function syncInboundMessengerEvent(event: FacebookNormalizedEvent) {
  if (!event.psid) {
    throw new Error('Messenger event missing psid');
  }

  const contact = await upsertFacebookContact({
    psid: event.psid,
    name: event.senderName,
    facebookUserId: event.senderId,
  });

  const conversation = await upsertMessengerConversation(event.pageId, contact.id);

  const messageType = event.attachments?.length ? 'image' : 'text';
  const messageKind = event.kind === 'messenger_postback' ? 'postback' : messageType;

  await createFacebookMessage({
    conversationId: conversation.id,
    contactId: contact.id,
    direction: 'inbound',
    messageType: messageKind,
    text: event.text || event.postbackPayload,
    attachments: event.attachments,
    facebookMessageId: event.messageId,
    rawPayload: event.raw,
  });

  return { contact, conversation };
}
