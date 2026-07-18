/**
 * Normalize Telegram Bot API Update → command text.
 */

import type { NormalizedTelegramUpdate } from './types';

export function normalizeTelegramUpdate(raw: unknown): NormalizedTelegramUpdate | null {
  if (!raw || typeof raw !== 'object') return null;
  const update = raw as Record<string, unknown>;
  const updateId = Number(update.update_id);
  if (!Number.isFinite(updateId)) return null;

  const message =
    (update.message as Record<string, unknown> | undefined) ||
    (update.edited_message as Record<string, unknown> | undefined) ||
    null;
  if (!message) return null;

  const chat = (message.chat || {}) as Record<string, unknown>;
  const from = (message.from || {}) as Record<string, unknown>;
  const chatId = chat.id != null ? String(chat.id) : '';
  const userId = from.id != null ? String(from.id) : '';
  if (!chatId || !userId) return null;

  let text = typeof message.text === 'string' ? message.text.trim() : '';
  // Strip @BotName from /cmd@BotName
  if (text.startsWith('/')) {
    text = text.replace(/^\/([a-zA-Z0-9_]+)@[^\s]+/, '/$1');
  }

  const isCommand = text.startsWith('/');
  return {
    updateId,
    chatId,
    userId,
    username: typeof from.username === 'string' ? from.username : null,
    text,
    messageId: message.message_id != null ? Number(message.message_id) : undefined,
    isCommand,
  };
}
