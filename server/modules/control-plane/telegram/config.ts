/**
 * Load Telegram Console config from settings + env (DI-friendly).
 */

import { getSettings } from '../../../dbHelper';
import type { AppSettings } from '../../../../src/types';
import type { TelegramConsoleConfig, TelegramConsoleMode } from './types';

function splitIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function envFlag(name: string): boolean | null {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return null;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return null;
}

function resolveMode(settings: AppSettings): TelegramConsoleMode {
  const fromEnv = process.env.TELEGRAM_CONSOLE_MODE?.trim().toLowerCase();
  if (fromEnv === 'webhook' || fromEnv === 'polling') return fromEnv;
  const fromSettings = String(settings.telegram_console_mode || '')
    .trim()
    .toLowerCase();
  if (fromSettings === 'webhook' || fromSettings === 'polling') return fromSettings;
  return 'polling';
}

export async function loadTelegramConsoleConfig(
  settingsOverride?: AppSettings,
): Promise<TelegramConsoleConfig> {
  const settings = settingsOverride ?? ((await getSettings()) as AppSettings);
  const envEnabled = envFlag('TELEGRAM_CONSOLE_ENABLED');
  const settingsConsole = settings.telegram_console_enabled;
  const telegramOn = settings.telegram_enabled !== false;

  const enabled =
    envEnabled !== null
      ? envEnabled
      : typeof settingsConsole === 'boolean'
        ? settingsConsole && telegramOn
        : telegramOn && Boolean(String(settings.telegram_bot_token || '').trim());

  const allowedUserIds = [
    ...splitIds(process.env.TELEGRAM_ALLOWED_USER_IDS),
    ...splitIds(settings.telegram_allowed_user_ids),
  ];
  const allowedChatIds = [
    ...splitIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS),
    ...splitIds(settings.telegram_allowed_chat_ids),
    ...(settings.telegram_chat_id ? [String(settings.telegram_chat_id).trim()] : []),
  ].filter(Boolean);
  const adminUserIds = [
    ...splitIds(process.env.TELEGRAM_ADMIN_USER_IDS),
    ...splitIds(settings.telegram_admin_user_ids),
  ];

  return {
    enabled,
    botToken: String(settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    primaryChatId: String(settings.telegram_chat_id || '').trim(),
    allowedUserIds: [...new Set(allowedUserIds)],
    allowedChatIds: [...new Set(allowedChatIds.filter(Boolean))],
    adminUserIds: [...new Set(adminUserIds)],
    mode: resolveMode(settings),
    webhookSecret: String(
      process.env.TELEGRAM_WEBHOOK_SECRET || settings.telegram_webhook_secret || '',
    ).trim(),
    companyId:
      typeof settings.agent_sync_company_id === 'string' && settings.agent_sync_company_id.trim()
        ? settings.agent_sync_company_id.trim()
        : null,
    pollIntervalMs: Math.max(
      1500,
      Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 2500) || 2500,
    ),
    eventNotifyIntervalMs: Math.max(
      5000,
      Number(process.env.TELEGRAM_EVENT_NOTIFY_MS || 15_000) || 15_000,
    ),
    rateLimitPerMinute: Math.max(
      1,
      Number(process.env.TELEGRAM_RATE_LIMIT_PER_MIN || 20) || 20,
    ),
  };
}
