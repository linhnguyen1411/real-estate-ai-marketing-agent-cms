import { Router, type Request, type Response } from 'express';
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
import { buildAssistantDbContext, buildAssistantFallback } from './assistantHelpers';

export async function deleteChatSessionHandler(req: Request, res: Response) {
  const sessionUserId = decodeURIComponent(String(req.params.sessionUserId || '').trim());
  if (!sessionUserId) {
    res.status(400).json({ status: 'error', message: 'Thiếu mã phiên trò chuyện.' });
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

export function assertCanManageChatSession(req: Request, res: Response, sessionUserId: string): boolean {
  const authUser = getAuthUser(req);

  if (sessionUserId.startsWith('public-')) {
    if (authUser.role === 'member') {
      res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa lịch sử khách chat.' });
      return false;
    }
    return true;
  }

  if (authUser.role === 'owner') return true;

  if (authUser.role === 'company') {
    if (sessionUserId === authUser.id) return true;
    const meta = getChatHistorySessionMeta(sessionUserId);
    if (meta?.company_id && meta.company_id !== authUser.company_id) {
      res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa lịch sử chat này.' });
      return false;
    }
    return true;
  }

  if (sessionUserId !== authUser.id) {
    res.status(403).json({ status: 'error', message: 'Bạn chỉ được xóa lịch sử chat của chính mình.' });
    return false;
  }

  return true;
}

export function createChatRouter() {
  const router = Router();

router.get('/api/ai/status', async (req: Request, res: Response) => {
  try {
    const providers = await getAIProviderStatus();
    const briefing = await getAiStatusBriefingText();
    res.json({ status: 'success', data: providers, briefing });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/api/ai/chat', async (req: Request, res: Response) => {
  const { message } = req.body;
  const db = readDatabase();
  const user = getAuthUser(req);

  if (!message) {
    res.status(400).json({ status: 'error', message: 'Tin nhắn không được trống' });
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
    console.log(`[INTERNAL RETRIEVAL] intent=${dbContext.query.intent} properties=${dbContext.properties.length} customers=${dbContext.customers.length} contextChars=${serializedDbContext.length}`);
    let aiResponse: string;

    try {
      aiResponse = await generateText(
        [
          'Bạn là AI assistant nội bộ cho CMS bất động sản.',
          'Bạn đang trả lời user đã đăng nhập và chỉ được dùng dữ liệu trong DB_CONTEXT.',
          'Không được bịa dữ liệu ngoài DB_CONTEXT. Nếu không có kết quả, nói rõ không tìm thấy trong phạm vi quyền hiện tại.',
          'Khi user hỏi tìm kiếm/lọc/so sánh, hãy nêu dữ liệu cụ thể: tên khách, số điện thoại, tên BĐS, giá, trạng thái, bài đăng.',
          'Trả lời tiếng Việt, ngắn gọn, có bullet nếu có nhiều kết quả.'
        ].join('\n'),
        [
          `DB_CONTEXT:\n${serializedDbContext}`,
          '',
          `CHAT_HISTORY:\n${recentHistory || 'Chưa có lịch sử trò chuyện.'}`,
          '',
          `USER_QUESTION:\n${message}`
        ].join('\n')
      );
    } catch (aiError: any) {
      console.error('CMS assistant AI failed, using DB fallback:', aiError.message || aiError);
      aiResponse = buildAssistantFallback(dbContext);
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
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/api/chat/history', (req: Request, res: Response) => {
  const db = readDatabase();
  const user = getAuthUser(req);
  const mineOnly = req.query.scope === 'mine';
  const history = (db.chat_history || []).filter(item => {
    if (mineOnly) return item.user_id === user.id;
    if (user.role === 'owner') return true;
    if (user.role === 'company') return item.company_id === user.company_id;
    return item.user_id === user.id;
  });

  res.json({ status: 'success', data: history });
});

router.delete('/api/chat/sessions/:sessionUserId', deleteChatSessionHandler);
router.post('/api/chat/sessions/:sessionUserId/delete', deleteChatSessionHandler);

router.get('/api/chat/guests', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (user.role === 'member') {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xem danh sách khách chat.' });
    return;
  }
  res.json({ status: 'success', data: getPublicChatGuests() });
});

router.get('/api/chat/guests/:sessionId/history', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (user.role === 'member') {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xem lịch sử khách chat.' });
    return;
  }
  const sessionId = String(req.params.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const history = getChatHistoryByUser(`public-${sessionId}`, 200).slice().reverse();
  res.json({ status: 'success', data: history });
});

router.put('/api/chat/guests/:sessionId/ai', async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (user.role === 'member') {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền đổi trạng thái AI.' });
    return;
  }
  const sessionId = String(req.params.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const guest = await updatePublicChatGuestAi(sessionId, Boolean(req.body?.ai_enabled));
  if (!guest) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách chat.' });
    return;
  }
  res.json({ status: 'success', data: guest });
});

router.post('/api/chat/guests/:sessionId/messages', async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (user.role === 'member') {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền gửi tin cho khách.' });
    return;
  }
  const sessionId = String(req.params.sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const guest = getPublicChatGuest(sessionId);
  const message = String(req.body?.message || '').trim();
  if (!guest) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách chat.' });
    return;
  }
  if (!message) {
    res.status(400).json({ status: 'error', message: 'Tin nhắn không được trống.' });
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
