/**
 * Single reply adapter — all Telegram console responses go through sendMessage.
 */

import { sendTelegramMessage } from '../../../notifications/telegramNotificationService';

export type TelegramReplyPort = {
  reply(input: { chatId: string; text: string; botToken: string }): Promise<{
    ok: boolean;
    error?: string;
    messageId?: string;
  }>;
};

export function createTelegramReplyPort(): TelegramReplyPort {
  return {
    async reply(input) {
      const text = String(input.text || '').trim() || '(empty)';
      const result = await sendTelegramMessage({
        botToken: input.botToken,
        chatId: input.chatId,
        text,
      });
      return {
        ok: result.ok,
        error: result.error,
        messageId: result.messageId,
      };
    },
  };
}
