import crypto from 'crypto';
import { prisma } from '../prisma';
import type { FacebookNormalizedEvent } from './types';
import { analyzeIntent } from './intentDetector';

async function addLeadTags(leadId: string, tags: string[]) {
  for (const tag of tags) {
    await prisma.leadTag.upsert({
      where: { leadId_tag: { leadId, tag } },
      create: {
        id: `ltag-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        leadId,
        tag,
      },
      update: {},
    });
  }
}

export async function syncIntentLead(input: {
  event: FacebookNormalizedEvent;
  contactId: string;
  conversationId?: string;
  sourceType: 'messenger' | 'comment';
}) {
  const text = input.event.text || input.event.postbackPayload;
  const intent = analyzeIntent(text, input.sourceType);
  if (!intent.hasIntent) return null;

  return createOrUpdateFacebookLead({
    contactId: input.contactId,
    pageId: input.event.pageId,
    conversationId: input.conversationId,
    sourceType: input.sourceType,
    firstMessage: text,
    postId: input.event.postId,
    commentId: input.event.commentId,
    contactName: input.event.senderName,
    psid: input.event.psid,
    score: intent.score,
    tags: intent.tags,
    phone: intent.phone,
  });
}

export async function createOrUpdateFacebookLead(input: {
  contactId: string;
  pageId: string;
  conversationId?: string;
  sourceType: 'messenger' | 'comment' | 'reaction';
  firstMessage?: string;
  postId?: string;
  commentId?: string;
  contactName?: string;
  psid?: string;
  score: number;
  tags: string[];
  phone?: string | null;
}) {
  const contact = await prisma.facebookContact.findUnique({ where: { id: input.contactId } });
  if (!contact) return null;

  const now = new Date();
  const realPhone = input.phone || null;
  const fallbackPhone = input.psid ? `fb:${input.psid}` : `fb-contact:${input.contactId}`;

  let existing = contact.leadId
    ? await prisma.lead.findUnique({ where: { id: contact.leadId }, include: { tags: true } })
    : null;

  if (!existing && realPhone) {
    existing = await prisma.lead.findFirst({
      where: { phone: realPhone },
      orderBy: { createdAt: 'desc' },
      include: { tags: true },
    });
  }

  if (!existing) {
    existing = await prisma.lead.findFirst({
      where: { facebookContactId: input.contactId },
      orderBy: { createdAt: 'desc' },
      include: { tags: true },
    });
  }

  if (existing) {
    const nextScore = Math.max(existing.investorScore, input.score);
    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        investorScore: nextScore,
        firstMessage: existing.firstMessage || input.firstMessage,
        facebookContactId: input.contactId,
        facebookConversationId: input.conversationId || existing.facebookConversationId,
        facebookPageId: input.pageId,
        sourceChannel: 'facebook',
        sourceType: input.sourceType,
        sourcePostId: input.postId || existing.sourcePostId,
        sourceCommentId: input.commentId || existing.sourceCommentId,
        phone: realPhone && !existing.phone.startsWith('fb:') ? existing.phone : (realPhone || existing.phone),
        updatedAt: now,
      },
    });
    await addLeadTags(existing.id, input.tags);
    if (!contact.leadId) {
      await prisma.facebookContact.update({
        where: { id: input.contactId },
        data: { leadId: existing.id },
      });
    }
    return prisma.lead.findUnique({ where: { id: existing.id }, include: { tags: true } });
  }

  const leadId = `lead-fb-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const lead = await prisma.lead.create({
    data: {
      id: leadId,
      name: input.contactName || contact.name || 'Khách Facebook',
      phone: realPhone || fallbackPhone,
      source: 'facebook',
      channel: 'facebook',
      sourceChannel: 'facebook',
      sourceType: input.sourceType,
      sourcePostId: input.postId,
      sourceCommentId: input.commentId,
      firstMessage: input.firstMessage,
      facebookContactId: input.contactId,
      facebookConversationId: input.conversationId,
      facebookPageId: input.pageId,
      investorScore: input.score,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    },
  });

  await addLeadTags(lead.id, input.tags);

  await prisma.facebookContact.update({
    where: { id: input.contactId },
    data: { leadId: lead.id },
  });

  return lead;
}
