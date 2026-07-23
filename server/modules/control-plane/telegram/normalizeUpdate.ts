/**
 * Normalize Telegram Bot API Update → command text or callback.
 */

import type { NormalizedTelegramUpdate } from './types';

export type NormalizedTelegramCallback = {
  kind: 'callback';
  updateId: number;
  chatId: string;
  userId: string;
  username?: string | null;
  callbackQueryId: string;
  data: string;
};

export type NormalizedInbound =
  | (NormalizedTelegramUpdate & { kind: 'message' })
  | NormalizedTelegramCallback;

export function normalizeTelegramInbound(raw: unknown): NormalizedInbound | null {
  if (!raw || typeof raw !== 'object') return null;
  const update = raw as Record<string, unknown>;
  const updateId = Number(update.update_id);
  if (!Number.isFinite(updateId)) return null;

  const cb = update.callback_query as Record<string, unknown> | undefined;
  if (cb) {
    const message = (cb.message || {}) as Record<string, unknown>;
    const chat = (message.chat || {}) as Record<string, unknown>;
    const from = (cb.from || {}) as Record<string, unknown>;
    const chatId = chat.id != null ? String(chat.id) : '';
    const userId = from.id != null ? String(from.id) : '';
    const data = typeof cb.data === 'string' ? cb.data : '';
    const callbackQueryId = cb.id != null ? String(cb.id) : '';
    if (!chatId || !userId || !data || !callbackQueryId) return null;
    return {
      kind: 'callback',
      updateId,
      chatId,
      userId,
      username: typeof from.username === 'string' ? from.username : null,
      callbackQueryId,
      data,
    };
  }

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
  if (text.startsWith('/')) {
    text = text.replace(/^\/([a-zA-Z0-9_]+)@[^\s]+/, '/$1');
  }

  return {
    kind: 'message',
    updateId,
    chatId,
    userId,
    username: typeof from.username === 'string' ? from.username : null,
    text,
    messageId: message.message_id != null ? Number(message.message_id) : undefined,
    isCommand: text.startsWith('/'),
  };
}

/** @deprecated use normalizeTelegramInbound */
export function normalizeTelegramUpdate(raw: unknown): NormalizedTelegramUpdate | null {
  const inbound = normalizeTelegramInbound(raw);
  if (!inbound || inbound.kind !== 'message') return null;
  const { kind: _k, ...rest } = inbound;
  return rest;
}
