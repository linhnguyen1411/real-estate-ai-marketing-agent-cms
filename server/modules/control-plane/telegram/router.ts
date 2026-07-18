/**
 * Telegram Router — Update → ACL → Command Engine → Reply.
 * No business logic; no Prisma; no Worker/Browser calls.
 */

import { handleTelegramControlCommand } from '../telegramRemoteConsole';
import { checkTelegramAcl, canMutateViaTelegram } from './acl';
import { normalizeTelegramUpdate } from './normalizeUpdate';
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
];

export type TelegramRouterDeps = {
  config: TelegramConsoleConfig;
  replyPort: TelegramReplyPort;
  /** Injectable for tests */
  runCommand?: typeof handleTelegramControlCommand;
};

export type TelegramRouteResult = {
  handled: boolean;
  ok: boolean;
  reason?: string;
  command?: string;
  replyText?: string;
};

export async function routeTelegramUpdate(
  rawUpdate: unknown,
  deps: TelegramRouterDeps,
): Promise<TelegramRouteResult> {
  const normalized = normalizeTelegramUpdate(rawUpdate);
  if (!normalized) {
    return { handled: false, ok: true, reason: 'ignored_non_message' };
  }
  if (!normalized.isCommand || !normalized.text) {
    return { handled: false, ok: true, reason: 'ignored_non_command' };
  }

  const acl = checkTelegramAcl(deps.config, {
    chatId: normalized.chatId,
    userId: normalized.userId,
  });
  if (!acl.ok) {
    const replyText =
      acl.reason === 'rate_limited'
        ? 'Rate limited. Try again in a minute.'
        : 'Unauthorized. This chat/user is not allowed to control the console.';
    await deps.replyPort.reply({
      botToken: deps.config.botToken,
      chatId: normalized.chatId,
      text: replyText,
    });
    return { handled: true, ok: false, reason: acl.reason, replyText };
  }

  const lower = normalized.text.toLowerCase();
  const mutating = MUTATING_PREFIXES.some(p => lower.startsWith(p));
  if (mutating && !canMutateViaTelegram(acl.role)) {
    const replyText = 'Forbidden: viewer role cannot mutate missions/publish.';
    await deps.replyPort.reply({
      botToken: deps.config.botToken,
      chatId: normalized.chatId,
      text: replyText,
    });
    return { handled: true, ok: false, reason: 'forbidden_role', replyText };
  }

  const run = deps.runCommand ?? handleTelegramControlCommand;
  const result = await run(normalized.text, { companyId: deps.config.companyId });
  const replyText = result.text || (result.ok ? 'OK' : 'Command failed');

  await deps.replyPort.reply({
    botToken: deps.config.botToken,
    chatId: normalized.chatId,
    text: replyText,
  });

  return {
    handled: true,
    ok: result.ok,
    command: result.command,
    replyText,
  };
}
