import { Prisma } from '@prisma/client';
import { getSettings } from '../dbHelper';
import { prisma } from '../prisma';
import type { AppSettings } from '../../src/types';
import {
  isDegradedFacebookUrl,
  isSolidFacebookPermalink,
  normalizeSocialLinks,
  toMobileFriendlyFacebookUrl,
  verifySocialLinks,
} from '../modules/link-normalization';
import { notification } from './notificationRouter';

const EVENT_KEY_PREFIX = 'finding:';
const EVENT_KEY_SUFFIX = ':telegram:new';

/** Durable NEW_LEAD idempotency key — shared by all producers. */
export function leadAlertEventKey(findingId: string): string {
  return `${EVENT_KEY_PREFIX}${findingId}${EVENT_KEY_SUFFIX}`;
}

export type TelegramSendResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  messageId?: string | null;
  error?: string;
};

function telegramEventKey(findingId: string): string {
  return leadAlertEventKey(findingId);
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
    gemini_api_key: settings.gemini_api_key
      ? maskTelegramToken(settings.gemini_api_key)
      : settings.gemini_api_key,
    openai_api_key: settings.openai_api_key
      ? maskTelegramToken(settings.openai_api_key)
      : settings.openai_api_key,
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

export async function sendTelegramMessage(input: {
  botToken: string;
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  replyMarkup?: unknown;
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
        ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
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
 * H2.4.4 — SINGLE producer for NEW_LEAD → canonical Sales Action Card only.
 * Never throws to callers — logs and marks failed on send errors.
 */
export async function notifyFindingIfEligible(input: {
  findingId: string;
  settings?: AppSettings;
  /** Manual approve: bypass classification + heat gate (not credentials). */
  force?: boolean;
}): Promise<TelegramSendResult> {
  try {
    const settings = input.settings || getSettings();
    // Hard-on: ignore AGENT_TELEGRAM_ENABLED / settings.telegram_enabled / quiet hours.
    // Still requires bot token + chat id; score/classification eligibility still apply unless force.
    const botToken = String(settings.telegram_bot_token || '').trim();
    const leadChatId = String(process.env.TELEGRAM_LEAD_CHAT_ID || '').trim();
    if (!botToken || !leadChatId) {
      console.info('[telegram] skip missing_credentials finding=%s', input.findingId);
      return { ok: false, skipped: true, reason: 'missing_credentials' };
    }

    const finding = await prisma.agentFinding.findUnique({
      where: { id: input.findingId },
      include: {
        source: { select: { id: true, name: true, type: true, url: true } },
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

    const classificationNorm = String(finding.classification || '').trim().toLowerCase();
    if (
      !input.force &&
      (classificationNorm === 'spam' ||
        classificationNorm === 'seller' ||
        classificationNorm === 'broker' ||
        classificationNorm === 'noise')
    ) {
      console.info(
        'lead_alert: findingId=%s event=NEW_LEAD status=skipped reason=blocked_class class=%s',
        finding.id,
        classificationNorm,
      );
      return { ok: false, skipped: true, reason: 'blocked_class' };
    }

    // Durable idempotency for NEW_LEAD (one card per finding)
    const eventKey = telegramEventKey(finding.id);
    const existing = await prisma.telegramDeliveryLog.findFirst({
      where: { companyId: finding.companyId, eventKey },
    });
    if (existing && (existing.status === 'sent' || existing.status === 'queued')) {
      console.info(
        'lead_alert: findingId=%s event=NEW_LEAD status=deduplicated',
        finding.id,
      );
      return { ok: false, skipped: true, reason: 'already_sent', messageId: existing.telegramMsgId };
    }

    const {
      processLeadAcquisition,
      readAcquisitionProfile,
    } = await import('../modules/lead-acquisition');
    const {
      processSalesLayer,
      readSalesProfile,
      formatSalesActionCard,
      salesActionCardKeyboard,
      buildLeadCenterUrl,
      formatAreaLabel,
      resolveSourceProvenance,
      resolveBuyerConfidencePct,
      shouldSendBuyerAlert,
      resolveLeadAlertRole,
      isTrustedContentUrl,
    } = await import('../modules/sales-layer');

    let acq = readAcquisitionProfile(finding.extractedData);
    if (!acq) {
      acq = await processLeadAcquisition({
        findingId: finding.id,
        notifyTelegram: false,
      });
    }

    const role = resolveLeadAlertRole({
      intent: acq?.intent.intent,
      classification: finding.classification,
      persona: acq?.persona.persona,
      isBuyer: acq?.isBuyer,
    });

    // Seller / broker / spam / non-demand → no Lead Alert (unless manual force with role)
    if (!input.force && !role) {
      console.info(
        'lead_alert: findingId=%s event=NEW_LEAD status=skipped reason=not_demand_lead class=%s',
        finding.id,
        finding.classification,
      );
      return { ok: false, skipped: true, reason: 'not_demand_lead' };
    }

    let sales = readSalesProfile(finding.extractedData);
    if (!sales && (acq?.isBuyer || role === 'tenant' || role === 'investor')) {
      sales = await processSalesLayer({ findingId: finding.id, notifyFollowUp: false }).catch(
        () => null,
      );
    }

    const confidencePct = resolveBuyerConfidencePct({
      salesConfidencePct: null,
      acquisitionFinalScore:
        acq?.priority.finalScore ?? finding.finalScore ?? finding.score ?? null,
      intentConfidence: acq?.intent.confidence ?? null,
    });

    if (!input.force && !shouldSendBuyerAlert(confidencePct) && !acq?.isVip) {
      console.info(
        'lead_alert: findingId=%s event=NEW_LEAD status=skipped reason=below_threshold confidence=%s',
        finding.id,
        confidencePct,
      );
      return { ok: false, skipped: true, reason: 'below_heat_threshold' };
    }

    if (!input.force && settings.telegram_only_with_phone) {
      const phone = finding.primaryPhone;
      if (!phone) {
        console.info('[telegram] skip no_phone finding=%s', finding.id);
        return { ok: false, skipped: true, reason: 'no_phone' };
      }
    }

    const openPostHint = finding.scannedContent?.canonicalUrl || null;

    const roleResolved = role || 'buyer';
    // H2.4.7 — content provenance only; SSOT canonicalize; never use AgentSource.url as post
    const sourceProv = resolveSourceProvenance({
      extractedData: finding.extractedData,
      agentSourceName: finding.source?.name,
      agentSourceType: finding.source?.type,
      canonicalUrl: openPostHint,
      externalId: finding.scannedContent?.externalId || null,
      agentSourceUrl: finding.source && 'url' in finding.source
        ? (finding.source as { url?: string | null }).url
        : null,
    });
    const sourceUrlFinal = sourceProv.url; // fail closed — no openPostHint bypass

    const text = formatSalesActionCard({
      findingId: finding.id,
      acquisition: acq,
      sales,
      confidencePct,
      role: roleResolved,
      classification: finding.classification,
      actorName: finding.personName,
      propertyType: finding.propertyType,
      location: finding.primaryLocation,
      budgetMin: finding.budgetMin,
      budgetMax: finding.budgetMax,
      areaLabel: formatAreaLabel(finding.extractedData),
      timeline: acq?.timeline,
      extractedData: finding.extractedData,
      agentSourceName: finding.source?.name,
      agentSourceType: finding.source?.type,
      sourceUrl: sourceUrlFinal,
      title: finding.title,
      needSummary: finding.needSummary,
      summary: finding.summary,
      hasPhone: Boolean(finding.primaryPhone),
      phone: finding.primaryPhone,
      whyReasons: acq?.intent.reasons,
    });

    let replyMarkup = salesActionCardKeyboard({
      findingId: finding.id,
      sourceUrl: sourceUrlFinal,
      leadCenterUrl: buildLeadCenterUrl(finding.id),
      hasPhone: Boolean(finding.primaryPhone),
      phone: finding.primaryPhone,
    });

    const sourceEd =
      finding.extractedData &&
      typeof finding.extractedData === 'object' &&
      !Array.isArray(finding.extractedData)
        ? ((finding.extractedData as Record<string, unknown>).source as
            | Record<string, unknown>
            | undefined)
        : undefined;
    const links = normalizeSocialLinks({
      postUrl: sourceUrlFinal,
      groupUrl:
        typeof sourceEd?.groupUrl === 'string'
          ? sourceEd.groupUrl
          : finding.source?.url || null,
      postId: typeof sourceEd?.postId === 'string' ? sourceEd.postId : null,
      groupId: typeof sourceEd?.groupId === 'string' ? sourceEd.groupId : null,
      canonicalUrl: sourceUrlFinal || openPostHint,
      externalId: finding.scannedContent?.externalId || null,
    });

    const hasLinkCandidates = Boolean(links.postUrl || links.groupUrl || links.rawPostUrl);
    const skipVerify =
      process.env.TELEGRAM_SKIP_LINK_VERIFY === '1' || process.env.NODE_ENV === 'test';
    let openPost = links.postUrl;
    let openGroup = links.groupUrl;
    if (hasLinkCandidates) {
      const verified = await verifySocialLinks(links, { skipVerify });
      if (!verified.verified && !skipVerify) {
        // Soft-allow solid Facebook permalinks even when bot HTTP check fails
        if (!isSolidFacebookPermalink(links.postUrl) && !isSolidFacebookPermalink(sourceUrlFinal)) {
          console.info(
            '[telegram] skip link_unverified finding=%s err=%s',
            finding.id,
            verified.verify?.error || 'verify_failed',
          );
          return { ok: false, skipped: true, reason: 'link_unverified' };
        }
      }
      // Prefer solid original permalink; never adopt login-wall finalUrl
      if (links.postUrl && isSolidFacebookPermalink(links.postUrl)) {
        openPost = toMobileFriendlyFacebookUrl(links.postUrl) || links.postUrl;
      } else if (verified.openUrl && !isDegradedFacebookUrl(verified.openUrl)) {
        if (links.postUrl && verified.openUrl === links.postUrl) {
          openPost = verified.openUrl;
        } else if (!links.postUrl || verified.openUrl === links.groupUrl) {
          openPost = null;
          openGroup = verified.openUrl;
        } else {
          openPost = verified.openUrl;
        }
      }
      openGroup = openGroup || links.groupUrl;
    }

    const pickSourceButtonUrl = (...candidates: Array<string | null | undefined>): string | null => {
      const mobile = candidates
        .map(u => (u ? toMobileFriendlyFacebookUrl(u) || u : null))
        .filter((u): u is string => Boolean(u) && !isDegradedFacebookUrl(u));
      // Source must be a solid post permalink — never group-home / login wall
      return (
        mobile.find(
          u =>
            isSolidFacebookPermalink(u) &&
            isTrustedContentUrl(u, {
              agentSourceName: finding.source?.name,
              platform: sourceProv.platform,
            }),
        ) || null
      );
    };

    const sourceButtonUrl = pickSourceButtonUrl(openPost, sourceUrlFinal, links.rawPostUrl);

    replyMarkup = salesActionCardKeyboard({
      findingId: finding.id,
      sourceUrl: sourceButtonUrl,
      leadCenterUrl: buildLeadCenterUrl(finding.id),
      hasPhone: Boolean(finding.primaryPhone),
      phone: finding.primaryPhone,
    });

    await upsertDeliveryLog({
      companyId: finding.companyId,
      eventKey,
      findingId: finding.id,
      chatId: leadChatId,
      status: 'queued',
      attempts: (existing?.attempts || 0) + 1,
      payloadPreview: text,
    });

    const heat = confidencePct >= 80 ? 'HOT' : confidencePct >= 60 ? 'WARM' : 'COLD';
    const send = await notification.send({
      type: 'lead_found',
      payload: {
        findingId: finding.id,
        entityId: finding.id,
        score: confidencePct,
        summary: text,
        postUrl: openPost,
        groupUrl: openGroup,
        title: 'Lead Alert',
      },
      replyMarkup,
      text,
      dedupeKey: eventKey,
      settings,
      immediate: true,
    });
    if (!send.ok) {
      await upsertDeliveryLog({
        companyId: finding.companyId,
        eventKey,
        findingId: finding.id,
        chatId: leadChatId,
        status: 'failed',
        attempts: (existing?.attempts || 0) + 1,
        lastError: send.error || 'send_failed',
        payloadPreview: text,
      });
      console.warn(
        'lead_alert: findingId=%s event=NEW_LEAD confidence=%s heat=%s channel=LEAD status=failed',
        finding.id,
        confidencePct,
        heat,
      );
      return { ok: false, error: send.error };
    }

    await upsertDeliveryLog({
      companyId: finding.companyId,
      eventKey,
      findingId: finding.id,
      chatId: leadChatId,
      status: 'sent',
      attempts: (existing?.attempts || 0) + 1,
      telegramMsgId: send.messageId || null,
      payloadPreview: text,
      sentAt: new Date(),
    });

    console.info(
      'lead_alert: findingId=%s event=NEW_LEAD confidence=%s heat=%s channel=LEAD status=sent',
      finding.id,
      confidencePct,
      heat,
    );

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
    const opsChatId = String(process.env.TELEGRAM_OPS_CHAT_ID || '').trim();
    if (!botToken || !opsChatId) {
      return {
        ok: false,
        error: 'Chưa cấu hình telegram_bot_token / TELEGRAM_OPS_CHAT_ID.',
      };
    }
    const text =
      input?.text?.trim() ||
      `Test Telegram (OPS) từ Real Estate AI Agent — ${new Date().toISOString()}`;
    const send = await notification.sendDirect({
      chatId: opsChatId,
      text,
      settings,
      skipDedup: true,
    });
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
