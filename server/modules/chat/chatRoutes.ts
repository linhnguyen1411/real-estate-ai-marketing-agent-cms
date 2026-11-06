import { sendError } from '../../utils/httpResponses';
import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  deleteChatHistoryByUserId,
  deletePublicChatGuest,
  getChatHistoryByUser,
  getChatHistorySessionMeta,
  getPublicChatGuest,
  getPublicChatGuests,
  readDatabase,
  saveChatMessage,
  updatePublicChatGuestAi,
} from '../../dbHelper';
import { generateText, getAIProviderStatus, getAiStatusBriefingText } from '../../aiService';
import { getAuthUser } from '../auth/authAccess';
import { isSuperAdminUser } from '../auth/tenantScope';
import { buildAssistantDbContext, buildAssistantFallback } from './assistantHelpers';
import { retrieveRagKnowledge, buildOfficialSystemPrompt } from './ragKnowledgeService';

export async function deleteChatSessionHandler(req: Request, res: Response) {
  const sessionUserId = decodeURIComponent(String(req.params.sessionUserId || '').trim());
  if (!sessionUserId) {
    sendError(res, 400, 'Thiếu mã phiên trò chuyện.');
    return;
  }

  if (!assertCanManageChatSession(req, res, sessionUserId)) return;

  const deletedCount = await deleteChatHistoryByUserId(sessionUserId);
  let guestDeleted = false;

  if (sessionUserId.startsWith('public-')) {
    const sessionId = sessionUserId.slice('public-'.length);
    guestDeleted = await deletePublicChatGuest(sessionId) > 0;
  }

  res.json({
    status: 'success',
    data: {
      sessionUserId,
      deletedMessages: deletedCount,
      guestDeleted
    }
  });
}

function canManageWebsiteChat(req: Request): boolean {
  const authUser = getAuthUser(req);
  if (isSuperAdminUser(authUser)) return true;
  const perm = req.userPermissions?.website_chat;
  return Boolean(perm?.hasAccess && perm.scope !== 'none' && !perm.requiresPremiumUpgrade);
}

export function assertCanManageChatSession(req: Request, res: Response, sessionUserId: string): boolean {
  const authUser = getAuthUser(req);

  if (sessionUserId.startsWith('public-')) {
    if (!canManageWebsiteChat(req)) {
      sendError(res, 403, 'Bạn không có quyền xóa lịch sử khách chat.');
      return false;
    }
    return true;
  }

  if (isSuperAdminUser(authUser)) return true;

  if (authUser.role === 'company') {
    if (sessionUserId === authUser.id) return true;
    const meta = getChatHistorySessionMeta(sessionUserId);
    if (meta?.company_id && meta.company_id !== authUser.company_id) {
      sendError(res, 403, 'Bạn không có quyền xóa lịch sử chat này.');
      return false;
    }
    return true;
  }

  if (sessionUserId !== authUser.id) {
    sendError(res, 403, 'Bạn chỉ được xóa lịch sử chat của chính mình.');
    return false;
  }

  return true;
}

import { requirePermission, resolvePermissions } from '../rbac';

/**
 * Website guest chat and chat history are platform-root features: super admins
 * get them by default, and they can only be delegated to members of the root team.
 */
async function requirePlatformRootTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authUser = getAuthUser(req);
  if (!authUser) {
    sendError(res, 401, 'Yêu cầu đăng nhập.');
    return;
  }
  if (isSuperAdminUser(authUser)) {
    next();
    return;
  }
  try {
    const resolved = await resolvePermissions(authUser as any);
    if (resolved.isPlatformRootTeam) {
      next();
      return;
    }
  } catch {
    /* fall through to deny */
  }
  sendError(res, 403, 'Tính năng chat khách website chỉ dành cho Super Admin và thành viên team gốc.');
}

export function createChatRouter() {
  const router = Router();

  router.use('/api/chat/guests', requirePermission('website_chat'), requirePlatformRootTeam);
  router.use('/api/ai/chat', requirePermission('chatbot.use'));
  router.use(
    ['/api/chat/history', '/api/chat/sessions'],
    requirePermission('chatbot.use'),
    requirePlatformRootTeam,
  );

router.get('/api/ai/status', async (req: Request, res: Response) => {
  try {
    const providers = await getAIProviderStatus();
    const briefing = await getAiStatusBriefingText();
    res.json({ status: 'success', data: providers, briefing });
  } catch (err: any) {
    sendError(res, 500, err.message);
  }
});

router.post('/api/ai/chat', async (req: Request, res: Response) => {
  const { message } = req.body;
  const db = readDatabase();
  const user = getAuthUser(req);

  if (!message) {
    sendError(res, 400, 'Tin nhắn không được trống');
    return;
  }

  const recentHistory = (db.chat_history || [])
    .filter(item => item.user_id === user.id)
    .slice(0, 6)
    .reverse()
    .map(item => `${item.role === 'user' ? 'User' : 'Assistant'}: ${String(item.message || '').slice(0, 600)}`)
    .join('\n');

  try {
    await saveChatMessage({
      id: `chat-${Date.now()}-user`,
      user_id: user.id,
      company_id: user.company_id,
      role: 'user',
      message,
      created_at: new Date().toISOString()
    });

    const dbContext = buildAssistantDbContext(db, req, String(message));
    const serializedDbContext = JSON.stringify(dbContext, null, 2);
    const ragKnowledge = retrieveRagKnowledge(String(message), 4);
    console.log(`[INTERNAL RETRIEVAL] intent=${dbContext.query.intent} properties=${dbContext.properties.length} customers=${dbContext.customers.length} ragChunks=${ragKnowledge.chunks.length} contextChars=${serializedDbContext.length}`);

    const systemPrompt = buildOfficialSystemPrompt({
      userRole: user.role,
      roleKey: user.roleKey,
      isPlatformRootTeam: Boolean(user.isPlatformRootTeam),
    });

    let aiResponse: string;

    try {
      const promptSections = [
        ragKnowledge.formattedContext ? `RAG_KNOWLEDGE:\n${ragKnowledge.formattedContext}` : '',
        '',
        `DB_CONTEXT:\n${serializedDbContext}`,
        '',
        `CHAT_HISTORY:\n${recentHistory || 'Chưa có lịch sử trò chuyện.'}`,
        '',
        `USER_QUESTION:\n${message}`
      ].filter(Boolean);

      aiResponse = await generateText(systemPrompt, promptSections.join('\n'));
    } catch (aiError: any) {
      console.error('CMS assistant AI failed, using DB/RAG fallback:', aiError.message || aiError);
      aiResponse = buildAssistantFallback(dbContext, ragKnowledge);
    }

    await saveChatMessage({
      id: `chat-${Date.now()}-model`,
      user_id: user.id,
      company_id: user.company_id,
      role: 'model',
      message: aiResponse,
      created_at: new Date().toISOString()
    });

    res.json({ status: 'success', data: aiResponse });
  } catch (err: any) {
    sendError(res, 500, err.message);
  }
});

router.get('/api/chat/history', (req: Request, res: Response) => {
  const db = readDatabase();
  const user = getAuthUser(req);
  const mineOnly = req.query.scope === 'mine';
  const history = (db.chat_history || []).filter(item => {
    if (mineOnly) return item.user_id === user.id;
    if (isSuperAdminUser(user) || req.scope === 'all') return true;
    if (req.scope === 'team' || user.role === 'company') {
      return item.company_id === user.company_id;
    }
    return item.user_id === user.id;
  });

  res.json({ status: 'success', data: history });
});

router.delete('/api/chat/sessions/:sessionUserId', deleteChatSessionHandler);
router.post('/api/chat/sessions/:sessionUserId/delete', deleteChatSessionHandler);

router.get('/api/chat/guests', (req: Request, res: Response) => {
  if (!canManageWebsiteChat(req)) {
    sendError(res, 403, 'Bạn không có quyền xem danh sách khách chat.');
    return;
  }
  res.json({ status: 'success', data: getPublicChatGuests() });
});

router.get('/api/chat/guests/:sessionId/history', (req: Request, res: Response) => {
  if (!canManageWebsiteChat(req)) {
    sendError(res, 403, 'Bạn không có quyền xem lịch sử khách chat.');
    return;
  }
  const sessionId = String(req.params.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const history = getChatHistoryByUser(`public-${sessionId}`, 200).slice().reverse();
  res.json({ status: 'success', data: history });
});

router.put('/api/chat/guests/:sessionId/ai', async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!canManageWebsiteChat(req)) {
    sendError(res, 403, 'Bạn không có quyền đổi trạng thái AI.');
    return;
  }
  const sessionId = String(req.params.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const guest = await updatePublicChatGuestAi(sessionId, Boolean(req.body?.ai_enabled));
  if (!guest) {
    sendError(res, 404, 'Không tìm thấy khách chat.');
    return;
  }
  res.json({ status: 'success', data: guest });
});

router.post('/api/chat/guests/:sessionId/messages', async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!canManageWebsiteChat(req)) {
    sendError(res, 403, 'Bạn không có quyền gửi tin cho khách.');
    return;
  }
  const sessionId = String(req.params.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const guest = getPublicChatGuest(sessionId);
  const message = String(req.body?.message || '').trim();
  if (!guest) {
    sendError(res, 404, 'Không tìm thấy khách chat.');
    return;
  }
  if (!message) {
    sendError(res, 400, 'Tin nhắn không được trống.');
    return;
  }
  await updatePublicChatGuestAi(sessionId, false);
  const saved = await saveChatMessage({
    id: `chat-admin-${Date.now()}-${user.id}`,
    user_id: `public-${sessionId}`,
    company_id: user.company_id,
    role: 'model',
    message,
    created_at: new Date().toISOString()
  });
  res.json({ status: 'success', data: saved });
});

  return router;
}
