/**
 * Notification Router — single entry for all Telegram push notifications (H0.3.6).
 * notification.send() → channel routing → formatter → transport.
 */

import { getSettings } from '../dbHelper';
import type { AppSettings } from '../../src/types';
import type { InlineKeyboard } from '../modules/control-plane/inlineKeyboard';
import {
  formatOpsBullet,
  formatRoutedNotification,
  keyboardForChannel,
} from './telegramFormatter';
import { sendTelegramMessage, type TelegramSendResult } from './telegramNotificationService';
import type {
  NotificationChannel,
  NotificationEventType,
  NotificationPayload,
} from './notificationTypes';
import {
  resolveChannelForEvent,
  CHANNEL_LABELS,
} from './notificationTypes';

export type NotificationSendInput = {
  type: NotificationEventType;
  payload?: NotificationPayload;
  /** Override routed channel (rare) */
  channel?: NotificationChannel;
  /** Pre-rendered text (skips formatter) */
  text?: string;
  replyMarkup?: InlineKeyboard;
  /** Dedup key — default: type:entityId */
  dedupeKey?: string;
  /** Skip dedup (e.g. console reply) */
  skipDedup?: boolean;
  /** Skip batching — send immediately */
  immediate?: boolean;
  settings?: AppSettings;
};

export type NotificationDirectInput = {
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  botToken?: string;
  settings?: AppSettings;
  dedupeKey?: string;
  skipDedup?: boolean;
};

const DEDUP_MS = 60_000;
const RATE_LIMIT_PER_MIN = 30;
const LEAD_BATCH_MS = 8_000;
const OPS_BATCH_MS = 5_000;

type ChannelChatConfig = Record<NotificationChannel, string>;

function loadChannelChatIds(): ChannelChatConfig {
  return {
    OPS: String(process.env.TELEGRAM_OPS_CHAT_ID || '').trim(),
    LEAD: String(process.env.TELEGRAM_LEAD_CHAT_ID || '').trim(),
    PUBLISH: String(process.env.TELEGRAM_PUBLISH_CHAT_ID || '').trim(),
    REPORT: String(process.env.TELEGRAM_REPORT_CHAT_ID || '').trim(),
    CRITICAL: String(process.env.TELEGRAM_CRITICAL_CHAT_ID || '').trim(),
  };
}

function resolveBotToken(settings?: AppSettings): string {
  const s = settings || getSettings();
  return String(s.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function defaultDedupeKey(type: NotificationEventType, payload: NotificationPayload): string {
  const id =
    payload.entityId ||
    payload.findingId ||
    payload.publishJobId ||
    payload.agentId ||
    'global';
  return `${type}:${id}`;
}

// --- In-memory dedup + rate limit ---
const recentDedup = new Map<string, number>();
const channelSendTimes = new Map<NotificationChannel, number[]>();

function isDuplicate(key: string): boolean {
  const now = Date.now();
  const last = recentDedup.get(key);
  if (last != null && now - last < DEDUP_MS) return true;
  recentDedup.set(key, now);
  // prune old entries occasionally
  if (recentDedup.size > 5000) {
    for (const [k, t] of recentDedup) {
      if (now - t > DEDUP_MS) recentDedup.delete(k);
    }
  }
  return false;
}

function isRateLimited(channel: NotificationChannel): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const times = (channelSendTimes.get(channel) || []).filter(t => t > windowStart);
  channelSendTimes.set(channel, times);
  return times.length >= RATE_LIMIT_PER_MIN;
}

function recordSend(channel: NotificationChannel): void {
  const times = channelSendTimes.get(channel) || [];
  times.push(Date.now());
  channelSendTimes.set(channel, times);
}

// --- Lead batch buffer ---
type LeadBatchItem = { input: NotificationSendInput; resolve: (r: TelegramSendResult) => void };
const leadBatch: LeadBatchItem[] = [];
let leadBatchTimer: ReturnType<typeof setTimeout> | null = null;

// --- OPS batch buffer (runtime events) ---
type OpsBatchItem = { type: NotificationEventType; payload: NotificationPayload };
const opsBatch: OpsBatchItem[] = [];
let opsBatchTimer: ReturnType<typeof setTimeout> | null = null;

export function resetNotificationRouterForTests(): void {
  recentDedup.clear();
  channelSendTimes.clear();
  leadBatch.length = 0;
  opsBatch.length = 0;
  if (leadBatchTimer) clearTimeout(leadBatchTimer);
  if (opsBatchTimer) clearTimeout(opsBatchTimer);
  leadBatchTimer = null;
  opsBatchTimer = null;
  testDeliverHook = null;
}

let testDeliverHook:
  | ((input: {
      channel: NotificationChannel;
      chatId: string;
      text: string;
    }) => Promise<TelegramSendResult>)
  | null = null;

export function setNotificationDeliverHookForTests(
  hook: typeof testDeliverHook,
): void {
  testDeliverHook = hook;
}

async function deliver(input: {
  channel: NotificationChannel;
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  settings?: AppSettings;
}): Promise<TelegramSendResult> {
  if (isRateLimited(input.channel)) {
    return { ok: false, skipped: true, reason: 'rate_limited' };
  }
  if (testDeliverHook) {
    const result = await testDeliverHook({
      channel: input.channel,
      chatId: input.chatId,
      text: input.text,
    });
    if (result.ok) recordSend(input.channel);
    return result;
  }
  const chatId = input.chatId.trim();
  const botToken = resolveBotToken(input.settings);
  if (!botToken || !chatId) {
    return { ok: false, skipped: true, reason: 'missing_credentials' };
  }
  const send = await sendTelegramMessage({
    botToken,
    chatId,
    text: input.text,
    replyMarkup: input.replyMarkup,
  });
  if (send.ok) recordSend(input.channel);
  return send.ok
    ? { ok: true, messageId: send.messageId || null }
    : { ok: false, error: send.error };
}

async function flushLeadBatch(): Promise<void> {
  leadBatchTimer = null;
  if (leadBatch.length === 0) return;
  const items = leadBatch.splice(0, leadBatch.length);
  const settings = items[0]?.input.settings;
  const channels = loadChannelChatIds();
  const chatId = channels.LEAD;
  if (!chatId) {
    for (const item of items) {
      item.resolve({ ok: false, skipped: true, reason: 'missing_lead_chat' });
    }
    return;
  }

  if (items.length === 1) {
    const single = items[0]!;
    const result = await sendNotification({ ...single.input, immediate: true });
    single.resolve(result);
    return;
  }

  const batchItems = items.map(i => ({
    id: i.input.payload?.findingId || i.input.payload?.entityId || 'lead',
    score: i.input.payload?.score ?? undefined,
    summary: i.input.payload?.summary ?? undefined,
  }));
  const text = formatRoutedNotification('LEAD', 'lead_found', {
    batchCount: items.length,
    batchItems,
  });
  const result = await deliver({
    channel: 'LEAD',
    chatId,
    text,
    settings,
  });
  for (const item of items) item.resolve(result);
}

async function flushOpsBatch(): Promise<void> {
  opsBatchTimer = null;
  if (opsBatch.length === 0) return;
  const items = opsBatch.splice(0, opsBatch.length);
  const channels = loadChannelChatIds();
  const chatId = channels.OPS;
  if (!chatId) return;

  const lines = items.slice(0, 15).map(i => formatOpsBullet(i.type, i.payload));
  const text = [CHANNEL_LABELS.OPS, ...lines].join('\n');
  const last = items[items.length - 1];
  const replyMarkup = last
    ? keyboardForChannel('OPS', last.type, last.payload)
    : keyboardForChannel('OPS', 'runtime', {});
  await deliver({ channel: 'OPS', chatId, text, replyMarkup });
}

/**
 * Main entry — routed notification by event type.
 */
export async function sendNotification(input: NotificationSendInput): Promise<TelegramSendResult> {
  try {
    const payload = input.payload || {};
    const channel = input.channel || resolveChannelForEvent(input.type);
    if (!channel) {
      return { ok: false, skipped: true, reason: 'no_channel' };
    }

    const dedupeKey = input.dedupeKey || defaultDedupeKey(input.type, payload);
    if (!input.skipDedup && isDuplicate(dedupeKey)) {
      return { ok: false, skipped: true, reason: 'dedup_60s' };
    }

    // Batch leads
    if (!input.immediate && channel === 'LEAD' && input.type === 'lead_found') {
      return new Promise(resolve => {
        leadBatch.push({ input, resolve });
        if (!leadBatchTimer) {
          leadBatchTimer = setTimeout(() => {
            void flushLeadBatch().catch(() => undefined);
          }, LEAD_BATCH_MS);
        }
      });
    }

    // Batch OPS runtime bullets (non-critical)
    if (
      !input.immediate &&
      channel === 'OPS' &&
      !input.text &&
      input.type !== 'mission_started'
    ) {
      opsBatch.push({ type: input.type, payload });
      if (!opsBatchTimer) {
        opsBatchTimer = setTimeout(() => {
          void flushOpsBatch().catch(() => undefined);
        }, OPS_BATCH_MS);
      }
      return { ok: true, skipped: false };
    }

    const channels = loadChannelChatIds();
    const chatId = channels[channel];
    if (!chatId) {
      return { ok: false, skipped: true, reason: `missing_chat_${channel.toLowerCase()}` };
    }

    const text = input.text || formatRoutedNotification(channel, input.type, payload);
    const replyMarkup = input.replyMarkup || keyboardForChannel(channel, input.type, payload);

    return await deliver({
      channel,
      chatId,
      text,
      replyMarkup,
      settings: input.settings,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Direct send to explicit chat (inbound console replies — not channel-routed).
 * Still goes through transport layer; no sendMessage elsewhere.
 */
export async function sendNotificationDirect(
  input: NotificationDirectInput,
): Promise<TelegramSendResult> {
  const chatId = String(input.chatId || '').trim();
  const botToken = input.botToken || resolveBotToken(input.settings);
  if (!botToken || !chatId) {
    return { ok: false, skipped: true, reason: 'missing_credentials' };
  }
  if (input.dedupeKey && !input.skipDedup && isDuplicate(input.dedupeKey)) {
    return { ok: false, skipped: true, reason: 'dedup_60s' };
  }
  const send = await sendTelegramMessage({
    botToken,
    chatId,
    text: input.text,
    replyMarkup: input.replyMarkup,
  });
  return send.ok
    ? { ok: true, messageId: send.messageId || null }
    : { ok: false, error: send.error };
}

/** Namespace export for notification.send() */
export const notification = {
  send: sendNotification,
  sendDirect: sendNotificationDirect,
  flushBatches: async () => {
    await flushLeadBatch();
    await flushOpsBatch();
  },
  getChannelChatIds: loadChannelChatIds,
};

export { loadChannelChatIds, resolveChannelForEvent };
