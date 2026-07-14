import { Prisma } from '@prisma/client';
import { getSettings } from '../dbHelper';
import { prisma } from '../prisma';
import { resolveLeadIntelligence } from '../../shared/agent-domain';
import type { AppSettings } from '../../src/types';
import { formatFindingTelegramMessage } from './telegramFormatter';

const EVENT_KEY_PREFIX = 'finding:';
const EVENT_KEY_SUFFIX = ':telegram:new';

export type TelegramSendResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  messageId?: string | null;
  error?: string;
};

function telegramEventKey(findingId: string): string {
  return `${EVENT_KEY_PREFIX}${findingId}${EVENT_KEY_SUFFIX}`;
}

export function maskTelegramToken(token: string | null | undefined): string {
  const t = String(token || '').trim();
  if (!t) return '';
  if (t.length <= 8) return '****';
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

export function maskSettingsSecrets(settings: AppSettings): AppSettings {
  return {
    ...settings,
    telegram_bot_token: settings.telegram_bot_token
      ? maskTelegramToken(settings.telegram_bot_token)
      : settings.telegram_bot_token,
    agent_sync_secret: settings.agent_sync_secret
      ? maskTelegramToken(settings.agent_sync_secret)
      : settings.agent_sync_secret,
  };
}

function parseHourMinute(value: string | undefined): { h: number; m: number } | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value.trim())) return null;
  const [hs, ms] = value.trim().split(':');
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/** True when current local time falls inside quiet hours window (supports overnight). */
export function isInQuietHours(
  start?: string,
  end?: string,
  now: Date = new Date(),
): boolean {
  const s = parseHourMinute(start);
  const e = parseHourMinute(end);
  if (!s || !e) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const startMin = s.h * 60 + s.m;
  const endMin = e.h * 60 + e.m;
  if (startMin === endMin) return false;
  if (startMin < endMin) return cur >= startMin && cur < endMin;
  return cur >= startMin || cur < endMin;
}

function normalizeClassifications(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  }
  return ['buyer', 'renter', 'investor'];
}

export async function sendTelegramMessage(input: {
  botToken: string;
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}): Promise<{ ok: boolean; messageId?: string; error?: string; raw?: unknown }> {
  const token = String(input.botToken || '').trim();
  const chatId = String(input.chatId || '').trim();
  if (!token || !chatId) {
    return { ok: false, error: 'Missing bot token or chat id' };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: input.text.slice(0, 4000),
        disable_web_page_preview: true,
        ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
      }),
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || raw.ok === false) {
      const desc =
        typeof raw.description === 'string'
          ? raw.description
          : `Telegram HTTP ${res.status}`;
      return { ok: false, error: desc, raw };
    }
    const result = (raw.result || {}) as Record<string, unknown>;
    const messageId =
      result.message_id != null ? String(result.message_id) : undefined;
    return { ok: true, messageId, raw };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function upsertDeliveryLog(input: {
  companyId: string | null;
  eventKey: string;
  findingId?: string | null;
  chatId?: string | null;
  status: string;
  attempts?: number;
  lastError?: string | null;
  telegramMsgId?: string | null;
  payloadPreview?: string | null;
  sentAt?: Date | null;
}): Promise<void> {
  try {
    await prisma.telegramDeliveryLog.upsert({
      where: {
        companyId_eventKey: {
          companyId: input.companyId,
          eventKey: input.eventKey,
        },
      },
      create: {
        companyId: input.companyId,
        eventKey: input.eventKey,
        findingId: input.findingId ?? null,
        chatId: input.chatId ?? null,
        status: input.status,
        attempts: input.attempts ?? 1,
        lastError: input.lastError ?? null,
        telegramMsgId: input.telegramMsgId ?? null,
        payloadPreview: input.payloadPreview?.slice(0, 500) ?? null,
        sentAt: input.sentAt ?? null,
      },
      update: {
        status: input.status,
        attempts: input.attempts ?? undefined,
        lastError: input.lastError ?? null,
        telegramMsgId: input.telegramMsgId ?? undefined,
        payloadPreview: input.payloadPreview?.slice(0, 500) ?? undefined,
        chatId: input.chatId ?? undefined,
        sentAt: input.sentAt ?? undefined,
      },
    });
  } catch (error) {
    // Unique on (companyId, eventKey) — null companyId may need findFirst fallback
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.telegramDeliveryLog.findFirst({
        where: { companyId: input.companyId, eventKey: input.eventKey },
      });
      if (existing) {
        await prisma.telegramDeliveryLog.update({
          where: { id: existing.id },
          data: {
            status: input.status,
            attempts: input.attempts ?? existing.attempts + 1,
            lastError: input.lastError ?? null,
            telegramMsgId: input.telegramMsgId ?? undefined,
            payloadPreview: input.payloadPreview?.slice(0, 500) ?? undefined,
            sentAt: input.sentAt ?? undefined,
          },
        });
      }
      return;
    }
    console.warn(
      '[telegram] delivery log upsert failed:',
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Notify Telegram for a finding if settings + eligibility allow.
 * Never throws to callers — logs and marks failed on send errors.
 */
export async function notifyFindingIfEligible(input: {
  findingId: string;
  settings?: AppSettings;
  /** Manual approve: bypass classification + minScore (and env gate if CMS telegram_enabled). */
  force?: boolean;
}): Promise<TelegramSendResult> {
  try {
    const settings = input.settings || getSettings();
    const envOn = process.env.AGENT_TELEGRAM_ENABLED?.trim().toLowerCase() === 'true';
    if (!envOn && !(input.force && settings.telegram_enabled)) {
      console.info('[telegram] skip env_disabled finding=%s', input.findingId);
      return { ok: false, skipped: true, reason: 'env_disabled' };
    }
    if (!settings.telegram_enabled) {
      console.info('[telegram] skip disabled(settings) finding=%s', input.findingId);
      return { ok: false, skipped: true, reason: 'disabled' };
    }
    const botToken = String(settings.telegram_bot_token || '').trim();
    const chatId = String(settings.telegram_chat_id || '').trim();
    if (!botToken || !chatId) {
      console.info('[telegram] skip missing_credentials finding=%s', input.findingId);
      return { ok: false, skipped: true, reason: 'missing_credentials' };
    }
    if (
      !input.force &&
      isInQuietHours(settings.telegram_quiet_hours_start, settings.telegram_quiet_hours_end)
    ) {
      console.info('[telegram] skip quiet_hours finding=%s', input.findingId);
      return { ok: false, skipped: true, reason: 'quiet_hours' };
    }

    const finding = await prisma.agentFinding.findUnique({
      where: { id: input.findingId },
      include: {
        source: { select: { id: true, name: true, type: true } },
        scannedContent: true,
      },
    });
    if (!finding) {
      return { ok: false, skipped: true, reason: 'not_found' };
    }
    if (finding.status === 'dismissed' || finding.status === 'duplicate') {
      return { ok: false, skipped: true, reason: 'status' };
    }
    if (finding.dedupeStatus === 'duplicate') {
      return { ok: false, skipped: true, reason: 'duplicate' };
    }

    const eventKey = telegramEventKey(finding.id);
    const existing = await prisma.telegramDeliveryLog.findFirst({
      where: { companyId: finding.companyId, eventKey },
    });
    if (existing && (existing.status === 'sent' || existing.status === 'queued')) {
      return { ok: false, skipped: true, reason: 'already_sent', messageId: existing.telegramMsgId };
    }

    const resolved = resolveLeadIntelligence(finding as unknown as Record<string, unknown>);
    const minScore = Number(settings.telegram_min_score ?? 70);
    const score = resolved.finalScore ?? finding.finalScore ?? finding.score ?? 0;
    if (!input.force && Number.isFinite(minScore) && score < minScore) {
      console.info(
        '[telegram] skip below_min_score finding=%s score=%s min=%s',
        finding.id,
        score,
        minScore,
      );
      return { ok: false, skipped: true, reason: 'below_min_score' };
    }

    const allowed = normalizeClassifications(settings.telegram_classifications);
    const classification = String(resolved.classification || finding.classification || '').toLowerCase();
    if (
      !input.force &&
      allowed.length &&
      classification &&
      !allowed.includes(classification)
    ) {
      console.info(
        '[telegram] skip classification finding=%s class=%s allowed=%s',
        finding.id,
        classification,
        allowed.join(','),
      );
      return { ok: false, skipped: true, reason: 'classification' };
    }

    if (!input.force && settings.telegram_only_with_phone) {
      const phone = resolved.primaryPhone || finding.primaryPhone;
      if (!phone) {
        console.info('[telegram] skip no_phone finding=%s', finding.id);
        return { ok: false, skipped: true, reason: 'no_phone' };
      }
    }

    const text = formatFindingTelegramMessage(finding, resolved, {
      includePhone: settings.telegram_include_phone !== false,
      includeBudget: settings.telegram_include_budget !== false,
      includeLocation: settings.telegram_include_location !== false,
      includeLink: settings.telegram_include_link !== false,
      siteBaseUrl: process.env.PUBLIC_SITE_URL || settings.agent_sync_vps_url,
    });

    await upsertDeliveryLog({
      companyId: finding.companyId,
      eventKey,
      findingId: finding.id,
      chatId,
      status: 'queued',
      attempts: (existing?.attempts || 0) + 1,
      payloadPreview: text,
    });

    const send = await sendTelegramMessage({ botToken, chatId, text });
    if (!send.ok) {
      await upsertDeliveryLog({
        companyId: finding.companyId,
        eventKey,
        findingId: finding.id,
        chatId,
        status: 'failed',
        attempts: (existing?.attempts || 0) + 1,
        lastError: send.error || 'send_failed',
        payloadPreview: text,
      });
      console.warn('[telegram] send failed:', send.error);
      return { ok: false, error: send.error };
    }

    await upsertDeliveryLog({
      companyId: finding.companyId,
      eventKey,
      findingId: finding.id,
      chatId,
      status: 'sent',
      attempts: (existing?.attempts || 0) + 1,
      telegramMsgId: send.messageId || null,
      payloadPreview: text,
      sentAt: new Date(),
    });

    return { ok: true, messageId: send.messageId || null };
  } catch (error) {
    console.warn(
      '[telegram] notifyFindingIfEligible error:',
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendTestTelegram(input?: {
  text?: string;
  settings?: AppSettings;
}): Promise<TelegramSendResult> {
  try {
    const settings = input?.settings || getSettings();
    const botToken = String(settings.telegram_bot_token || '').trim();
    const chatId = String(settings.telegram_chat_id || '').trim();
    if (!botToken || !chatId) {
      return { ok: false, error: 'Chưa cấu hình telegram_bot_token / telegram_chat_id.' };
    }
    const text =
      input?.text?.trim() ||
      `Test Telegram từ Real Estate AI Agent — ${new Date().toISOString()}`;
    const send = await sendTelegramMessage({ botToken, chatId, text });
    if (!send.ok) {
      console.warn('[telegram] test failed:', send.error);
      return { ok: false, error: send.error };
    }
    return { ok: true, messageId: send.messageId || null };
  } catch (error) {
    console.warn(
      '[telegram] sendTestTelegram error:',
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
