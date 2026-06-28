import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { verifyFacebookWebhookChallenge } from './facebook/webhookVerify';
import { queueFacebookWebhookProcessing } from './facebook/webhookReceiver';
import { getFacebookConfig } from './facebook/config';
import {
  getFacebookConversationDetail,
  linkLeadToContact,
  listFacebookConversations,
  listFacebookInteractions,
  listFacebookLeads,
  updateFacebookConversationStatus,
  updateFacebookInteractionStatus,
} from './facebook/facebookDb';
import { createOrUpdateFacebookLead } from './facebook/leadSyncCore';
import { getFacebookMessengerUrl, getFacebookPostUrl } from './facebook/graphApi';
import { testFacebookPageConnection } from './facebook/graphApi';
import { canSendPrivateReply } from './facebook/privateReplyService';

function verifyPostSignature(req: Request): boolean {
  const { appSecret } = getFacebookConfig();
  const signature = req.headers['x-hub-signature-256'];
  if (!appSecret || !signature || typeof signature !== 'string') {
    return true;
  }
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(raw).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function registerFacebookWebhookRoutes(app: import('express').Express) {
  app.get('/webhooks/facebook', (req: Request, res: Response) => {
    const challenge = verifyFacebookWebhookChallenge(req.query as Record<string, unknown>);
    if (!challenge) {
      res.status(403).send('Forbidden');
      return;
    }
    res.status(200).send(challenge);
  });

  app.post('/webhooks/facebook', (req: Request, res: Response) => {
    if (!verifyPostSignature(req)) {
      res.status(403).json({ status: 'error', message: 'Invalid signature' });
      return;
    }
    queueFacebookWebhookProcessing(req.body);
    res.status(200).send('EVENT_RECEIVED');
  });
}

export function registerFacebookAdminRoutes(app: import('express').Express) {
  app.get('/api/admin/facebook/test-connection', async (_req: Request, res: Response) => {
    try {
      const result = await testFacebookPageConnection();
      res.json({ status: 'success', data: result });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Test connection failed',
      });
    }
  });

  app.get('/api/facebook/inbox', async (_req: Request, res: Response) => {
    try {
      const rows = await listFacebookConversations(100);
      const data = rows.map(row => ({
        id: row.id,
        pageId: row.pageId,
        channel: row.channel,
        status: row.status,
        lastMessageAt: row.lastMessageAt?.toISOString(),
        contact: {
          id: row.contact.id,
          psid: row.contact.psid,
          name: row.contact.name,
          profilePic: row.contact.profilePic,
          leadId: row.contact.leadId,
          leadScore: row.contact.leads[0]?.investorScore,
        },
        lastMessage: row.messages[0]
          ? {
              text: row.messages[0].text,
              direction: row.messages[0].direction,
              createdAt: row.messages[0].createdAt.toISOString(),
            }
          : null,
        messengerUrl: getFacebookMessengerUrl(row.contact.psid),
      }));
      res.json({ status: 'success', data });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Không tải được inbox Facebook',
      });
    }
  });

  app.get('/api/facebook/inbox/:id', async (req: Request, res: Response) => {
    try {
      const row = await getFacebookConversationDetail(req.params.id);
      if (!row) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy hội thoại' });
        return;
      }
      const lead = row.contact.leads[0];
      res.json({
        status: 'success',
        data: {
          ...row,
          messengerUrl: getFacebookMessengerUrl(row.contact.psid),
          lead: lead
            ? {
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                investorScore: lead.investorScore,
                status: lead.status,
                tags: lead.tags.map(t => t.tag),
                firstMessage: lead.firstMessage,
              }
            : null,
          messages: row.messages.map(msg => ({
            id: msg.id,
            direction: msg.direction,
            messageType: msg.messageType,
            text: msg.text,
            attachments: msg.attachments,
            createdAt: msg.createdAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Không tải được chi tiết hội thoại',
      });
    }
  });

  app.patch('/api/facebook/inbox/:id/status', async (req: Request, res: Response) => {
    const status = String(req.body?.status || '').trim();
    if (!status) {
      res.status(400).json({ status: 'error', message: 'Thiếu status' });
      return;
    }
    const row = await updateFacebookConversationStatus(req.params.id, status);
    res.json({ status: 'success', data: row });
  });

  app.get('/api/facebook/comments', async (_req: Request, res: Response) => {
    try {
      const rows = await listFacebookInteractions(100, 'comment');
      const data = await Promise.all(rows.map(async row => ({
        id: row.id,
        text: row.text,
        postId: row.postId,
        commentId: row.commentId,
        status: row.status,
        intentTags: row.intentTags,
        canPrivateReply: row.canPrivateReply,
        createdAt: row.createdAt.toISOString(),
        postUrl: getFacebookPostUrl(row.postId || undefined),
        contact: row.contact
          ? { id: row.contact.id, name: row.contact.name, psid: row.contact.psid }
          : null,
        privateReplyEligible: row.commentId
          ? await canSendPrivateReply(row.commentId, row.pageId)
          : false,
      })));
      res.json({ status: 'success', data });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Không tải được comments',
      });
    }
  });

  app.patch('/api/facebook/comments/:id/status', async (req: Request, res: Response) => {
    const status = String(req.body?.status || '').trim();
    if (!status) {
      res.status(400).json({ status: 'error', message: 'Thiếu status' });
      return;
    }
    const row = await updateFacebookInteractionStatus(req.params.id, status);
    res.json({ status: 'success', data: row });
  });

  app.post('/api/facebook/comments/:id/create-lead', async (req: Request, res: Response) => {
    try {
      const interaction = (await listFacebookInteractions(200)).find(r => r.id === req.params.id);
      if (!interaction || !interaction.contactId) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy comment hoặc contact' });
        return;
      }
      const lead = await createOrUpdateFacebookLead({
        contactId: interaction.contactId,
        pageId: interaction.pageId,
        sourceType: 'comment',
        firstMessage: interaction.text || undefined,
        postId: interaction.postId || undefined,
        commentId: interaction.commentId || undefined,
        baseScore: 20,
        extraTags: ['comment', 'manual-create'],
      });
      res.json({ status: 'success', data: lead });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Không tạo được lead',
      });
    }
  });

  app.get('/api/facebook/leads', async (_req: Request, res: Response) => {
    try {
      const rows = await listFacebookLeads(100);
      res.json({
        status: 'success',
        data: rows.map(lead => ({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          sourceType: lead.sourceType,
          firstMessage: lead.firstMessage,
          investorScore: lead.investorScore,
          status: lead.status,
          tags: lead.tags.map(t => t.tag),
          createdAt: lead.createdAt.toISOString(),
          contact: lead.facebookContact
            ? { id: lead.facebookContact.id, name: lead.facebookContact.name, psid: lead.facebookContact.psid }
            : null,
        })),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Không tải được Facebook leads',
      });
    }
  });

  app.post('/api/facebook/conversations/:conversationId/link-lead/:leadId', async (req: Request, res: Response) => {
    try {
      const conversation = await getFacebookConversationDetail(req.params.conversationId);
      if (!conversation) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy hội thoại' });
        return;
      }
      const lead = await linkLeadToContact(req.params.leadId, conversation.contactId);
      res.json({ status: 'success', data: lead });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Không gắn được lead',
      });
    }
  });

  app.post('/api/facebook/conversations/:conversationId/create-lead', async (req: Request, res: Response) => {
    try {
      const conversation = await getFacebookConversationDetail(req.params.conversationId);
      if (!conversation) {
        res.status(404).json({ status: 'error', message: 'Không tìm thấy hội thoại' });
        return;
      }
      const lastInbound = [...conversation.messages].reverse().find(m => m.direction === 'inbound');
      const lead = await createOrUpdateFacebookLead({
        contactId: conversation.contactId,
        pageId: conversation.pageId,
        conversationId: conversation.id,
        sourceType: 'messenger',
        firstMessage: lastInbound?.text || undefined,
        contactName: conversation.contact.name || undefined,
        psid: conversation.contact.psid,
        baseScore: 15,
        extraTags: ['messenger', 'manual-create'],
      });
      res.json({ status: 'success', data: lead });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Không tạo được lead',
      });
    }
  });
}
