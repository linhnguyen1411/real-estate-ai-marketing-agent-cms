/**
 * Shared reply formatting — one place for Copilot text shape.
 */

import type { CopilotIntentName, CopilotReply } from './types';
import type { InlineKeyboard } from '../inlineKeyboard';

export function replyOk(
  intent: CopilotIntentName,
  lines: string[],
  data?: Record<string, unknown>,
  replyMarkup?: InlineKeyboard,
  command?: string,
): CopilotReply {
  const clean = lines.filter(l => l != null && String(l).length > 0);
  return {
    ok: true,
    intent,
    lines: clean,
    text: clean.join('\n'),
    data,
    replyMarkup,
    command,
  };
}

export function replyFail(
  intent: CopilotIntentName,
  message: string,
  data?: Record<string, unknown>,
): CopilotReply {
  return {
    ok: false,
    intent,
    lines: [message],
    text: message,
    data,
  };
}

export function formatLeadLines(
  items: Array<{
    id: string;
    title: string | null;
    score: number | null;
    location: string | null;
    classification: string | null;
  }>,
  total: number,
): string[] {
  const lines = [`Tìm thấy ${total} lead:`];
  items.slice(0, 8).forEach((item, i) => {
    lines.push(
      `${i + 1}. [${item.score ?? '—'}] ${item.classification || 'lead'} · ${item.location || '—'} · ${item.title || item.id.slice(0, 10)}`,
    );
  });
  if (total > items.length) lines.push(`… +${total - items.length} nữa`);
  return lines;
}
