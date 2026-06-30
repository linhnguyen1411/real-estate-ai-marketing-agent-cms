import crypto from 'crypto';
import { prisma } from '../prisma';
import { getFacebookConfig } from './config';
import { encryptAccessToken, decryptAccessToken } from './tokenCrypto';

export async function ensureFacebookPageConnection() {
  const cfg = getFacebookConfig();
  if (!cfg.pageId || !cfg.pageAccessToken) return null;

  const encrypted = encryptAccessToken(cfg.pageAccessToken);
  return prisma.facebookPageConnection.upsert({
    where: { pageId: cfg.pageId },
    create: {
      id: `fb-page-${cfg.pageId}`,
      pageId: cfg.pageId,
      pageName: 'Estoria Fanpage',
      accessTokenEncrypted: encrypted,
      isActive: true,
    },
    update: {
      accessTokenEncrypted: encrypted,
      isActive: true,
      updatedAt: new Date(),
    },
  });
}

export async function getActivePageAccessToken(pageId?: string): Promise<string | null> {
  const cfg = getFacebookConfig();
  const targetPageId = pageId || cfg.pageId;
  if (!targetPageId) return cfg.pageAccessToken || null;

  const row = await prisma.facebookPageConnection.findFirst({
    where: { pageId: targetPageId, isActive: true },
  });
  if (row?.accessTokenEncrypted) {
    return decryptAccessToken(row.accessTokenEncrypted);
  }
  if (targetPageId === cfg.pageId && cfg.pageAccessToken) {
    return cfg.pageAccessToken;
  }
  return null;
}

export async function saveWebhookEvent(payload: unknown, eventType?: string | null) {
  const body = (payload && typeof payload === 'object' ? payload : {}) as { object?: string };
  return prisma.facebookWebhookEvent.create({
    data: {
      id: `fbwe-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      object: body.object || null,
      payload: (payload && typeof payload === 'object' ? payload : {}) as object,
      eventType: eventType || null,
      processed: false,
    },
  });
}

export async function markWebhookEventProcessed(id: string, error?: string) {
  return prisma.facebookWebhookEvent.update({
    where: { id },
    data: {
      processed: true,
      processedAt: new Date(),
      error: error || null,
    },
  });
}

export async function saveWebhookLog(payload: unknown) {
  const body = (payload && typeof payload === 'object' ? payload : {}) as { object?: string; entry?: unknown[] };
  return prisma.facebookWebhookLog.create({
    data: {
      id: `fbwh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      object: body.object || null,
      entryCount: Array.isArray(body.entry) ? body.entry.length : 0,
      payload: body as object,
    },
  });
}

export async function markWebhookLogProcessed(id: string, error?: string) {
  return prisma.facebookWebhookLog.update({
    where: { id },
    data: {
      processedAt: new Date(),
      error: error || null,
    },
  });
}

export async function upsertFacebookContact(input: {
  psid: string;
  name?: string;
  facebookUserId?: string;
  profilePic?: string;
}) {
  const now = new Date();
  const existing = await prisma.facebookContact.findUnique({ where: { psid: input.psid } });
  if (existing) {
    return prisma.facebookContact.update({
      where: { id: existing.id },
      data: {
        name: input.name || existing.name,
        facebookUserId: input.facebookUserId || existing.facebookUserId,
        profilePic: input.profilePic || existing.profilePic,
        lastSeenAt: now,
      },
    });
  }

  return prisma.facebookContact.create({
    data: {
      id: `fb-contact-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      psid: input.psid,
      name: input.name,
      facebookUserId: input.facebookUserId || input.psid,
      profilePic: input.profilePic,
      tags: [],
    },
  });
}

export async function upsertMessengerConversation(pageId: string, contactId: string) {
  const threadKey = `messenger:${contactId}`;
  const now = new Date();
  return prisma.facebookConversation.upsert({
    where: {
      pageId_threadKey: { pageId, threadKey },
    },
    create: {
      id: `fb-conv-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      pageId,
      contactId,
      channel: 'messenger',
      threadKey,
      status: 'open',
      lastMessageAt: now,
      lastInboundAt: now,
    },
    update: {
      status: 'open',
      lastMessageAt: now,
      lastInboundAt: now,
      updatedAt: now,
    },
  });
}

export async function createFacebookMessage(input: {
  conversationId: string;
  contactId: string;
  direction: 'inbound' | 'outbound';
  messageType: string;
  text?: string;
  attachments?: unknown;
  facebookMessageId?: string;
  facebookCommentId?: string;
  facebookPostId?: string;
  rawPayload?: unknown;
}) {
  return prisma.facebookMessage.create({
    data: {
      id: `fb-msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      conversationId: input.conversationId,
      contactId: input.contactId,
      direction: input.direction,
      messageType: input.messageType,
      text: input.text,
      attachments: input.attachments as object | undefined,
      facebookMessageId: input.facebookMessageId,
      facebookCommentId: input.facebookCommentId,
      facebookPostId: input.facebookPostId,
      rawPayload: input.rawPayload as object | undefined,
    },
  });
}

export async function createFacebookInteraction(input: {
  pageId: string;
  contactId?: string;
  type: string;
  postId?: string;
  commentId?: string;
  text?: string;
  status?: string;
  intentTags?: string[];
  canPrivateReply?: boolean;
  rawPayload?: unknown;
}) {
  return prisma.facebookInteraction.create({
    data: {
      id: `fb-int-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      pageId: input.pageId,
      contactId: input.contactId,
      type: input.type,
      postId: input.postId,
      commentId: input.commentId,
      text: input.text,
      status: input.status || 'new',
      intentTags: input.intentTags || [],
      canPrivateReply: Boolean(input.canPrivateReply),
      rawPayload: input.rawPayload as object | undefined,
    },
  });
}

export async function listFacebookConversations(limit = 50) {
  return prisma.facebookConversation.findMany({
    include: {
      contact: {
        include: {
          leads: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, investorScore: true, status: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: limit,
  });
}

export async function getFacebookConversationDetail(id: string) {
  return prisma.facebookConversation.findUnique({
    where: { id },
    include: {
      contact: {
        include: {
          leads: {
            include: { tags: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

export async function listFacebookInteractions(limit = 50, type?: string) {
  return prisma.facebookInteraction.findMany({
    where: type ? { type } : undefined,
    include: { contact: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function updateFacebookInteractionStatus(id: string, status: string) {
  return prisma.facebookInteraction.update({
    where: { id },
    data: { status },
  });
}

export async function updateFacebookConversationStatus(id: string, status: string) {
  return prisma.facebookConversation.update({
    where: { id },
    data: { status },
  });
}

export async function listFacebookLeads(limit = 50) {
  return prisma.lead.findMany({
    where: { sourceChannel: 'facebook' },
    include: { tags: true, facebookContact: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function linkLeadToContact(leadId: string, contactId: string) {
  await prisma.facebookContact.update({
    where: { id: contactId },
    data: { leadId },
  });
  return prisma.lead.update({
    where: { id: leadId },
    data: { facebookContactId: contactId },
  });
}
