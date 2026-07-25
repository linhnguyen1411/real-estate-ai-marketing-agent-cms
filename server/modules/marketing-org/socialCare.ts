/**
 * Social Care — classify comments for Conversation Queue.
 */

import type { ConversationCareLabel, ConversationItem } from './types';

type Rule = { label: ConversationCareLabel; re: RegExp; reason: string; priority: number };

const RULES: Rule[] = [
  { label: 'spam', re: /hack|crypto|forex|vay\s*nhanh|kiếm\s*\d+\s*tr|sex|xxx/i, reason: 'Spam signal', priority: 10 },
  { label: 'buyer', re: /cần\s*mua|tìm\s*mua|giá\s*bao|ngân\s*sách|xem\s*nhà|inbox|ib\b|zalo/i, reason: 'Buyer intent', priority: 95 },
  { label: 'inbox', re: /nhắn\s*tin|liên\s*hệ|gọi\s*cho|sđt|số\s*điện/i, reason: 'Wants private contact', priority: 85 },
  { label: 'reply', re: /cho\s*hỏi|hỏi\s*chút|còn\s*không|pháp\s*lý|sổ|diện\s*tích/i, reason: 'Needs public reply', priority: 70 },
];

export function classifyConversation(text: string): {
  label: ConversationCareLabel;
  reason: string;
  priority: number;
} {
  const hay = String(text || '');
  for (const r of RULES) {
    if (r.re.test(hay)) return { label: r.label, reason: r.reason, priority: r.priority };
  }
  if (!hay.trim()) return { label: 'ignore', reason: 'Empty', priority: 0 };
  return { label: 'reply', reason: 'Generic engagement — monitor', priority: 40 };
}

export function buildConversationItem(input: {
  id: string;
  source: string;
  text: string;
  at?: string;
}): ConversationItem {
  const c = classifyConversation(input.text);
  return {
    id: input.id,
    source: input.source,
    text: input.text.slice(0, 280),
    label: c.label,
    reason: c.reason,
    priority: c.priority,
    at: input.at || new Date().toISOString(),
  };
}
