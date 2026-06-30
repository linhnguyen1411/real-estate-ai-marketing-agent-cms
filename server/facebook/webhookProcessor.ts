import { parseFacebookWebhookPayload, inferWebhookEventType } from './webhookParser';
import { syncInboundMessengerEvent } from './conversationService';
import {
  syncCommentInteraction,
  syncIntentLead,
  syncReactionInteraction,
} from './leadSyncService';
import { fetchFacebookUserProfile } from './facebookApi';
import {
  ensureFacebookPageConnection,
  markWebhookEventProcessed,
  saveWebhookEvent,
  upsertFacebookContact,
} from './facebookDb';
import type { FacebookNormalizedEvent } from './types';

async function enrichContactProfile(event: FacebookNormalizedEvent) {
  if (!event.psid) return;
  const profile = await fetchFacebookUserProfile(event.psid, event.pageId);
  if (!profile) return;
  await upsertFacebookContact({
    psid: event.psid,
    name: profile.name || event.senderName,
    facebookUserId: event.senderId,
    profilePic: profile.profilePic,
  });
  if (profile.name) event.senderName = profile.name;
}

async function handleEvent(event: FacebookNormalizedEvent) {
  switch (event.kind) {
    case 'messenger_inbound':
    case 'messenger_postback':
    case 'messenger_optin': {
      const { contact, conversation } = await syncInboundMessengerEvent(event);
      await enrichContactProfile(event);
      await syncIntentLead({
        event,
        contactId: contact.id,
        conversationId: conversation.id,
        sourceType: 'messenger',
      });
      return;
    }
    case 'page_comment': {
      await enrichContactProfile(event);
      await syncCommentInteraction(event);
      return;
    }
    case 'page_reaction': {
      await syncReactionInteraction(event);
      return;
    }
    default:
      return;
  }
}

export async function processFacebookWebhookPayload(payload: unknown) {
  try {
    await ensureFacebookPageConnection();
  } catch (error) {
    console.warn('[facebook] page connection sync skipped:', error instanceof Error ? error.message : error);
  }

  const eventRow = await saveWebhookEvent(payload, inferWebhookEventType(payload));

  try {
    const events = parseFacebookWebhookPayload(payload);
    for (const event of events) {
      await handleEvent(event);
    }
    await markWebhookEventProcessed(eventRow.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook processing error';
    await markWebhookEventProcessed(eventRow.id, message);
    console.error('[facebook-webhook]', message);
  }
}

export function queueFacebookWebhookProcessing(payload: unknown) {
  setImmediate(() => {
    processFacebookWebhookPayload(payload).catch(error => {
      console.error('[facebook-webhook-async]', error);
    });
  });
}
