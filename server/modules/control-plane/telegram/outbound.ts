/**
 * Single reply adapter — all Telegram console responses go through Notification Router.
 */

import { sendNotificationDirect } from '../../../notifications/notificationRouter';
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
      return sendNotificationDirect({
        chatId,
        text,
        botToken: token,
        replyMarkup: input.replyMarkup,
        skipDedup: true,
      });
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

/** Transport — use notificationRouter.send / sendDirect instead of calling directly */
export { sendTelegramMessage } from '../../../notifications/telegramNotificationService';
