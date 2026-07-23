/**
 * Telegram Control Plane lifecycle — start/stop receiver + event push + Copilot summaries.
 */

import { loadTelegramConsoleConfig } from './config';
import { createTelegramReplyPort } from './outbound';
import { createTelegramEventNotifier, type EventNotifier } from './eventNotifier';
import {
  createPollingReceiver,
  createWebhookReceiver,
  createTelegramUpdateReceiver,
} from './updateReceiver';
import { createControlPlanePort } from '../copilot/controlPlanePort';
import { createSummaryScheduler } from '../copilot/summaryScheduler';
import type { TelegramConsoleConfig, TelegramUpdateReceiver } from './types';

type WebhookReceiver = ReturnType<typeof createWebhookReceiver>;

let running = false;
let config: TelegramConsoleConfig | null = null;
let receiver: TelegramUpdateReceiver | null = null;
let webhookReceiver: WebhookReceiver | null = null;
let eventNotifier: EventNotifier | null = null;
let summaryScheduler: ReturnType<typeof createSummaryScheduler> | null = null;

export function getTelegramConsoleStatus() {
  return {
    running,
    mode: config?.mode ?? null,
    enabled: config?.enabled ?? false,
    hasToken: Boolean(config?.botToken),
    primaryChatId: config?.primaryChatId || null,
    allowedUsers: config?.allowedUserIds.length ?? 0,
    allowedChats: config?.allowedChatIds.length ?? 0,
    summaryScheduler: Boolean(summaryScheduler),
  };
}

export async function startTelegramControlPlane(options?: {
  config?: TelegramConsoleConfig;
}): Promise<{ started: boolean; reason?: string; status: ReturnType<typeof getTelegramConsoleStatus> }> {
  if (running) {
    return { started: true, reason: 'already_running', status: getTelegramConsoleStatus() };
  }

  config = options?.config ?? (await loadTelegramConsoleConfig());
  if (!config.enabled) {
    return { started: false, reason: 'disabled', status: getTelegramConsoleStatus() };
  }
  if (!config.botToken) {
    return { started: false, reason: 'missing_bot_token', status: getTelegramConsoleStatus() };
  }
  if (config.allowedChatIds.length === 0 && config.allowedUserIds.length === 0) {
    return { started: false, reason: 'acl_not_configured', status: getTelegramConsoleStatus() };
  }

  const replyPort = createTelegramReplyPort();
  const routerDeps = { replyPort };

  if (config.mode === 'webhook') {
    webhookReceiver = createWebhookReceiver({
      config,
      routerDeps,
      onError: err => console.error('[telegram-console] webhook route error', err),
    });
    receiver = webhookReceiver;
  } else {
    receiver = createTelegramUpdateReceiver({
      config,
      routerDeps,
      onError: err => console.error('[telegram-console] poll error', err),
    });
    if (receiver.mode !== 'polling') {
      receiver = createPollingReceiver({ config, routerDeps });
    }
  }

  await receiver.start();
  eventNotifier = createTelegramEventNotifier({ config });
  eventNotifier.start();

  const cfg = config;
  summaryScheduler = createSummaryScheduler({
    portFactory: async () =>
      createControlPlanePort({
        companyId: cfg.companyId,
        useLlmInsights: process.env.TELEGRAM_COPILOT_LLM === '1',
      }),
    notifier: {
      async send(text) {
        if (!cfg.botToken) return;
        const hour = new Date().getHours();
        const type =
          hour === 8 ? 'daily_08' : hour === 12 ? 'daily_12' : hour === 18 ? 'daily_18' : 'weekly';
        const { notification } = await import('../../../notifications/notificationRouter');
        await notification.send({
          type,
          payload: { summary: text },
          immediate: true,
          skipDedup: true,
        });
      },
    },
    tickMs: Number(process.env.TELEGRAM_SUMMARY_TICK_MS || 60_000),
  });
  summaryScheduler.start();

  running = true;
  console.log(
    `[telegram-console] started mode=${config.mode} chats=${config.allowedChatIds.length} users=${config.allowedUserIds.length} copilot=on`,
  );
  return { started: true, status: getTelegramConsoleStatus() };
}

export async function stopTelegramControlPlane(): Promise<void> {
  summaryScheduler?.stop();
  summaryScheduler = null;
  eventNotifier?.stop();
  eventNotifier = null;
  await receiver?.stop();
  receiver = null;
  webhookReceiver = null;
  running = false;
  config = null;
}

export async function handleTelegramWebhookUpdate(
  raw: unknown,
  secret?: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (!running || !config || !webhookReceiver) {
    const cfg = config ?? (await loadTelegramConsoleConfig());
    if (!cfg.enabled || !cfg.botToken) return { ok: false, reason: 'not_running' };
    if (cfg.mode !== 'webhook') return { ok: false, reason: 'mode_not_webhook' };
    if (cfg.webhookSecret && secret !== cfg.webhookSecret) {
      return { ok: false, reason: 'invalid_secret' };
    }
    const replyPort = createTelegramReplyPort();
    webhookReceiver = createWebhookReceiver({ config: cfg, routerDeps: { replyPort } });
    config = cfg;
    running = true;
  } else if (config.webhookSecret && secret !== config.webhookSecret) {
    return { ok: false, reason: 'invalid_secret' };
  }

  await webhookReceiver.handleUpdate(raw);
  return { ok: true };
}

/** Test-only */
export function _resetTelegramControlPlaneForTests(): void {
  summaryScheduler?.stop();
  summaryScheduler = null;
  eventNotifier?.stop();
  void receiver?.stop();
  eventNotifier = null;
  receiver = null;
  webhookReceiver = null;
  running = false;
  config = null;
}
