import { Router, type Request, type Response } from 'express';
import { readDatabase, writeDatabase } from '../../dbHelper';
import { generateAIConsultantReply } from '../../aiService';
import { parseListQuery, paginateItems, matchesSearchText } from '../../listPagination';
import {
  canAccessResource,
  canManageResource,
  scopeCollection,
} from '../auth/authAccess';
import { triggerAutomationEvent } from '../content/triggerAutomationEvent';

export function createInboxRouter() {
  const router = Router();

router.get('/api/inbox', (req: Request, res: Response) => {
  const db = readDatabase();
  let items = scopeCollection(db.inbox, req);
  const { hasPage, page, limit, search, status, sort } = parseListQuery(req.query as Record<string, unknown>);
  if (search) {
    items = items.filter(i =>
      matchesSearchText([i.sender_name, i.message, i.platform, i.intent || ''].join(' '), search),
    );
  }
  if (status) {
    items = items.filter(i => String(i.status || '') === status);
  }
  if (sort === 'created_at_asc') {
    items = items.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  } else {
    items = items.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
  if (!hasPage) {
    res.json({ status: 'success', data: items });
    return;
  }
  res.json({ status: 'success', data: paginateItems(items, page, limit) });
});

// POST /api/ai/generate-reply - Draft reply suggestion for a single message
router.post('/api/ai/generate-reply', async (req: Request, res: Response) => {
  const { messageId } = req.body;
  const db = readDatabase();
  const msg = db.inbox.find(i => i.id === messageId);

  if (!msg) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy tin nhắn.' });
    return;
  }

  if (!canAccessResource(msg, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xử lý tin nhắn này.' });
    return;
  }

  // Look up related customer/property for rich prompt context
  const customer = db.customers.find(c => c.id === msg.customer_id);
  const property = db.properties.find(p => p.id === (customer?.property_type === 'Đất nền' ? 'p-1' : 'p-2'));

  try {
    const aiSuggestion = await generateAIConsultantReply(msg.message, customer, property);
    msg.ai_reply_suggestion = aiSuggestion;
    
    // Auto classify intent if not present
    if (!msg.intent || msg.intent === 'chưa rõ') {
      const lower = msg.message.toLowerCase();
      if (lower.includes("giá") || lower.includes("nhiêu") || lower.includes("bao tiền")) {
        msg.intent = "hỏi giá";
      } else if (lower.includes("vị trí") || lower.includes("ở đâu") || lower.includes("địa chỉ")) {
        msg.intent = "hỏi vị trí";
      } else if (lower.includes("bớt") || lower.includes("thương lượng") || lower.includes("giảm")) {
        msg.intent = "thương lượng";
      } else if (lower.includes("xem") || lower.includes("đi gặp") || lower.includes("lịch")) {
        msg.intent = "đặt lịch xem";
      } else if (lower.includes("spam") || lower.includes("quảng cáo")) {
        msg.intent = "không tiềm năng";
      } else {
        msg.intent = "chưa rõ";
      }
    }

    // Trigger action automatic log representation
    if (msg.intent === 'hỏi giá' || msg.intent === 'thương lượng') {
      triggerAutomationEvent('Nhận comment bình luận hỏi giá', `Tin nhắn của ${msg.sender_name}`, db);
    }

    await writeDatabase(db);
    res.json({ status: 'success', data: msg });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Update reply status / send manual response simulations
router.post('/api/inbox/:id/reply', async (req: Request, res: Response) => {
  const { replyText } = req.body;
  const db = readDatabase();
  const index = db.inbox.findIndex(i => i.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy tin nhắn.' });
    return;
  }

  if (!canManageResource(db.inbox[index], req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền trả lời tin nhắn này.' });
    return;
  }

  db.inbox[index].status = 'replied';
  
  // Simulate posting the reply back to the platform
  console.log(`[OUTBOX SENT] Sent to ${db.inbox[index].platform} to ${db.inbox[index].sender_name}: "${replyText}"`);

  await writeDatabase(db);
  res.json({ status: 'success', data: db.inbox[index] });
});

  return router;
}
