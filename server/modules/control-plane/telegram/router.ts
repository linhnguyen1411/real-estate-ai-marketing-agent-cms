/**
 * Telegram Router — Update/Callback → ACL → Command Engine → Reply (+ keyboard).
 */

import { executeControlCommand, formatCommandText } from '../command-engine';
import { checkTelegramAcl, canMutateViaTelegram } from './acl';
import { callbackDataToCommand } from '../inlineKeyboard';
import { normalizeTelegramInbound } from './normalizeUpdate';
import type { TelegramReplyPort } from './outbound';
import type { TelegramConsoleConfig } from './types';

const MUTATING_PREFIXES = [
  '/scan',
  '/publish',
  '/cancel',
  '/retry',
  '/pause',
  '/resume',
  '/mission',
  '/agent restart',
  '/browser release',
  '/browser recover',
];

export type TelegramRouterDeps = {
  config: TelegramConsoleConfig;
  replyPort: TelegramReplyPort;
  runCommand?: (
    raw: string,
    options?: { companyId?: string | null },
  ) => Promise<{
    ok: boolean;
    command: string;
    text: string;
    replyMarkup?: {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
  }>;
};

export type TelegramRouteResult = {
  handled: boolean;
  ok: boolean;
  reason?: string;
  command?: string;
  replyText?: string;
};

async function runAndReply(
  commandText: string,
  chatId: string,
  deps: TelegramRouterDeps,
): Promise<TelegramRouteResult> {
  const run =
    deps.runCommand ??
    (async (raw: string, options?: { companyId?: string | null }) => {
      const result = await executeControlCommand(raw, {
        companyId: options?.companyId,
        client: 'telegram',
        triggeredBy: 'telegram-console',
      });
      return {
        ok: result.ok,
        command: result.command,
        text: formatCommandText(result),
        replyMarkup: result.replyMarkup,
      };
    });

  const result = await run(commandText, { companyId: deps.config.companyId });
  const replyText = result.text || (result.ok ? 'OK' : 'Command failed');
  await deps.replyPort.reply({
    botToken: deps.config.botToken,
    chatId,
    text: replyText,
    replyMarkup: result.replyMarkup,
  });
  return {
    handled: true,
    ok: result.ok,
    command: result.command,
    replyText,
  };
}

export async function routeTelegramUpdate(
  rawUpdate: unknown,
  deps: TelegramRouterDeps,
): Promise<TelegramRouteResult> {
  const inbound = normalizeTelegramInbound(rawUpdate);
  if (!inbound) {
    return { handled: false, ok: true, reason: 'ignored_non_message' };
  }

  const acl = checkTelegramAcl(deps.config, {
    chatId: inbound.chatId,
    userId: inbound.userId,
  });
  if (!acl.ok) {
    const replyText =
      acl.reason === 'rate_limited'
        ? 'Rate limited. Try again in a minute.'
        : 'Unauthorized. This chat/user is not allowed to control the console.';
    if (inbound.kind === 'callback') {
      await deps.replyPort.answerCallback?.({
        botToken: deps.config.botToken,
        callbackQueryId: inbound.callbackQueryId,
        text: 'Unauthorized',
      });
    }
    await deps.replyPort.reply({
      botToken: deps.config.botToken,
      chatId: inbound.chatId,
      text: replyText,
    });
    return { handled: true, ok: false, reason: acl.reason, replyText };
  }

  let commandText = '';
  if (inbound.kind === 'callback') {
    const mapped = callbackDataToCommand(inbound.data);
    await deps.replyPort.answerCallback?.({
      botToken: deps.config.botToken,
      callbackQueryId: inbound.callbackQueryId,
      text: mapped ? '…' : 'Unknown',
    });
    if (!mapped) {
      return { handled: true, ok: false, reason: 'unknown_callback' };
    }
    commandText = mapped;
  } else {
    if (!inbound.isCommand || !inbound.text) {
      return { handled: false, ok: true, reason: 'ignored_non_command' };
    }
    commandText = inbound.text;
  }

  const lower = commandText.toLowerCase();
  const mutating = MUTATING_PREFIXES.some(p => lower.startsWith(p));
  if (mutating && !canMutateViaTelegram(acl.role)) {
    const replyText = 'Forbidden: viewer role cannot mutate missions/publish.';
    await deps.replyPort.reply({
      botToken: deps.config.botToken,
      chatId: inbound.chatId,
      text: replyText,
    });
    return { handled: true, ok: false, reason: 'forbidden_role', replyText };
  }

  return runAndReply(commandText, inbound.chatId, deps);
}
