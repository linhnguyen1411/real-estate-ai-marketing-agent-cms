/**
 * Single reply adapter — all Telegram console responses go through sendMessage.
 */

import { sendTelegramMessage } from '../../../notifications/telegramNotificationService';
import type { InlineKeyboard } from '../inlineKeyboard';

export type TelegramReplyPort = {
  reply(input: {
    chatId: string;
    text: string;
    botToken: string;
    replyMarkup?: InlineKeyboard;
  }): Promise<{
    ok: boolean;
    error?: string;
    messageId?: string;
  }>;
  answerCallback?(input: {
    botToken: string;
    callbackQueryId: string;
    text?: string;
  }): Promise<void>;
};

export function createTelegramReplyPort(): TelegramReplyPort {
  return {
    async reply(input) {
      const text = String(input.text || '').trim() || '(empty)';
      const token = input.botToken;
      const chatId = input.chatId;
      if (!token || !chatId) {
        return { ok: false, error: 'Missing bot token or chat id' };
      }
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text.slice(0, 4000),
            disable_web_page_preview: true,
            ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
          }),
        });
        const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || raw.ok === false) {
          const desc =
            typeof raw.description === 'string'
              ? raw.description
              : `Telegram HTTP ${res.status}`;
          return { ok: false, error: desc };
        }
        const result = (raw.result || {}) as Record<string, unknown>;
        return {
          ok: true,
          messageId: result.message_id != null ? String(result.message_id) : undefined,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async answerCallback(input) {
      await fetch(`https://api.telegram.org/bot${input.botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: input.callbackQueryId,
          text: input.text || 'OK',
          show_alert: false,
        }),
      }).catch(() => undefined);
    },
  };
}

/** Keep legacy helper available for finding notify path */
export { sendTelegramMessage };
