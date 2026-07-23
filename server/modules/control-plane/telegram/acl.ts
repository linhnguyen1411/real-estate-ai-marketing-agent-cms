/**
 * Telegram Console ACL — allowlist users / chats / roles.
 */

import type { TelegramAclDecision, TelegramConsoleConfig, TelegramConsoleRole } from './types';

const rateBuckets = new Map<string, number[]>();

export function resetTelegramAclRateLimitForTests(): void {
  rateBuckets.clear();
}

export function resolveTelegramRole(
  config: TelegramConsoleConfig,
  userId: string,
): TelegramConsoleRole {
  if (config.adminUserIds.includes(userId)) return 'admin';
  if (config.allowedUserIds.length === 0) {
    // Open user list only when explicitly empty AND chats are allowlisted —
    // still require chat ACL. Role defaults to operator for allowed chats.
    return 'operator';
  }
  if (config.allowedUserIds.includes(userId)) return 'operator';
  return 'denied';
}

export function checkTelegramAcl(
  config: TelegramConsoleConfig,
  input: { chatId: string; userId: string },
  nowMs = Date.now(),
): TelegramAclDecision {
  if (!config.enabled) {
    return { ok: false, role: 'denied', reason: 'telegram_console_disabled' };
  }
  if (!config.botToken) {
    return { ok: false, role: 'denied', reason: 'missing_bot_token' };
  }

  if (config.allowedChatIds.length > 0 && !config.allowedChatIds.includes(input.chatId)) {
    return { ok: false, role: 'denied', reason: 'chat_not_allowed' };
  }

  const role = resolveTelegramRole(config, input.userId);
  if (role === 'denied') {
    return { ok: false, role, reason: 'user_not_allowed' };
  }

  // If no chat allowlist configured, require at least one allowed user id
  // so random chats cannot drive the bot with only a leaked token.
  if (config.allowedChatIds.length === 0 && config.allowedUserIds.length === 0) {
    return { ok: false, role: 'denied', reason: 'acl_not_configured' };
  }

  const key = `${input.chatId}:${input.userId}`;
  const windowStart = nowMs - 60_000;
  const prev = (rateBuckets.get(key) || []).filter(t => t >= windowStart);
  if (prev.length >= config.rateLimitPerMinute) {
    return { ok: false, role, reason: 'rate_limited' };
  }
  prev.push(nowMs);
  rateBuckets.set(key, prev);

  return { ok: true, role };
}

/** Commands that mutate missions / publish — admin or operator only (not viewer). */
export function canMutateViaTelegram(role: TelegramConsoleRole): boolean {
  return role === 'admin' || role === 'operator';
}
