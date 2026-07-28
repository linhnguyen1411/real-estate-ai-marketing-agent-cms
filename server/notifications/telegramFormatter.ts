/**
 * Telegram formatters — all outbound notification text + keyboards (H0.3.6 / H2.4.4).
 * NEW_LEAD single cards → canonical Sales Action Card only.
 * Batch digests remain a separate multi-lead summary format.
 */

import type { ResolvedLeadIntelligence } from '../../shared/agent-domain';
import { normalizeSocialLinks } from '../modules/link-normalization';
import type { InlineKeyboard } from '../modules/control-plane/inlineKeyboard';
import {
  incidentKeyboard,
  leadAlertKeyboard,
  opsActionKeyboard,
  publishJobKeyboard,
} from '../modules/control-plane/inlineKeyboard';
import {
  formatSalesActionCard,
  resolveLeadAlertRole,
} from '../modules/sales-layer/telegramSalesActionCard';
import type { NotificationChannel, NotificationEventType, NotificationPayload } from './notificationTypes';
import {
  CANONICAL_LEAD_ALERT_MARKER,
  CHANNEL_LABELS,
  LEAD_DIGEST_HEADER,
} from './notificationTypes';

export type TelegramFormatOptions = {
  includePhone?: boolean;
  includeBudget?: boolean;
  includeLocation?: boolean;
  includeLink?: boolean;
  siteBaseUrl?: string;
};

type FindingLike = {
  id?: string;
  title?: string | null;
  summary?: string | null;
  finalScore?: number | null;
  score?: number | null;
  classification?: string | null;
  primaryPhone?: string | null;
  primaryLocation?: string | null;
  needSummary?: string | null;
  propertyType?: string | null;
  budgetMin?: number | bigint | null;
  budgetMax?: number | bigint | null;
  personName?: string | null;
};

function propertyTypeDisplay(
  resolved: ResolvedLeadIntelligence | null | undefined,
  finding: FindingLike,
): string | null {
  const types = resolved?.property?.propertyTypes?.length
    ? resolved.property.propertyTypes
    : finding.propertyType
      ? [finding.propertyType]
      : [];
  if (!types.length) return null;
  const first = types.find(t => t !== 'land') || types[0];
  const key = String(first || '').toLowerCase();
  if (key === 'land' || /đất|dat|lô/.test(key)) return 'Đất';
  if (/nhà\s*phố|nha\s*pho|townhouse|house|nhà/.test(key) || key === 'house') return 'Nhà phố';
  if (/căn\s*hộ|can\s*ho|apartment|condo/.test(key) || key === 'apartment') return 'Căn hộ';
  if (/biệt\s*thự|biet\s*thu|villa/.test(key)) return 'Biệt thự';
  if (/shophouse|shop/.test(key)) return 'Shophouse';
  return first;
}

export type LeadTelegramFormatResult = {
  text: string;
  postUrl: string | null;
  groupUrl: string | null;
  canonicalUrl: string | null;
  postId: string | null;
  groupId: string | null;
  score: number;
};

export function formatFindingTelegramMessage(
  finding: FindingLike,
  resolved: ResolvedLeadIntelligence | null | undefined,
  options: TelegramFormatOptions = {},
): string {
  return formatLeadTelegramAlert(finding, resolved, options).text;
}

/**
 * Legacy entry → canonical Sales Action Card (H2.4.4).
 * Kept so historical callers / tests still resolve to ONE card layout.
 */
export function formatLeadTelegramAlert(
  finding: FindingLike,
  resolved: ResolvedLeadIntelligence | null | undefined,
  options: TelegramFormatOptions = {},
): LeadTelegramFormatResult {
  const includePhone = options.includePhone !== false;
  const includeBudget = options.includeBudget !== false;
  const includeLocation = options.includeLocation !== false;

  const score = resolved?.finalScore ?? finding.finalScore ?? finding.score ?? 0;
  const classification = resolved?.classification ?? finding.classification;
  const location = includeLocation
    ? resolved?.location.primary ||
      finding.primaryLocation ||
      [resolved?.location.district, resolved?.location.city].filter(Boolean).join(', ') ||
      null
    : null;
  const propertyLabel = propertyTypeDisplay(resolved, finding);
  const groupName = resolved?.source.groupName || resolved?.source.sourceName;
  const phone = includePhone
    ? resolved?.primaryPhone || finding.primaryPhone || null
    : null;
  const role =
    resolveLeadAlertRole({ classification, intent: classification }) ||
    (classification === 'renter'
      ? 'tenant'
      : classification === 'investor'
        ? 'investor'
        : 'buyer');

  const text = formatSalesActionCard({
    findingId: finding.id || resolved?.findingId || 'legacy',
    confidencePct: Number(score) || 0,
    role,
    classification,
    actorName: finding.personName || null,
    propertyType: propertyLabel || finding.propertyType,
    location,
    budgetMin: includeBudget
      ? (() => {
          const raw = resolved?.demand.buyerBudgetMin ?? finding.budgetMin ?? null;
          if (raw == null) return null;
          if (typeof raw === 'bigint') return raw;
          const n = Number(raw);
          return Number.isFinite(n) ? n : null;
        })()
      : null,
    budgetMax: includeBudget
      ? (() => {
          const raw = resolved?.demand.buyerBudgetMax ?? finding.budgetMax ?? null;
          if (raw == null) return null;
          if (typeof raw === 'bigint') return raw;
          const n = Number(raw);
          return Number.isFinite(n) ? n : null;
        })()
      : null,
    sourceLabel: groupName ? `Group: ${String(groupName).slice(0, 200)}` : null,
    title: finding.title,
    needSummary: resolved?.demand.needSummary || finding.needSummary,
    summary: finding.summary,
    hasPhone: Boolean(phone),
    phone,
  });

  const sourceEd =
    resolved && typeof resolved === 'object'
      ? (resolved as unknown as { source?: Record<string, unknown> }).source
      : undefined;
  const links = normalizeSocialLinks({
    canonicalUrl: resolved?.source.canonicalUrl,
    postUrl: resolved?.source.canonicalUrl,
    groupUrl: typeof sourceEd?.groupUrl === 'string' ? sourceEd.groupUrl : null,
    groupId: typeof sourceEd?.groupId === 'string' ? sourceEd.groupId : null,
    postId: typeof sourceEd?.postId === 'string' ? sourceEd.postId : null,
  });

  return {
    text,
    postUrl: links.postUrl,
    groupUrl: links.groupUrl,
    canonicalUrl: links.canonicalUrl,
    postId: links.postId,
    groupId: links.groupId,
    score: Number(score) || 0,
  };
}

/** Batch many leads into one concise message (NEW_LEAD_DIGEST — not a Sales Action Card). */
export function formatBatchedLeadSummary(
  items: Array<{ id: string; score?: number; summary?: string }>,
): string {
  const n = items.length;
  const lines = [LEAD_DIGEST_HEADER, `🎯 ${n} Lead mới`, ''];
  const top = items.slice(0, 5);
  for (const item of top) {
    const conf = item.score != null ? ` (${item.score}%)` : '';
    const snip = item.summary
      ? ` — ${String(item.summary).replace(/\s+/g, ' ').slice(0, 60)}`
      : '';
    lines.push(`• ${item.id.slice(0, 12)}${conf}${snip}`);
  }
  if (n > 5) lines.push(`… và ${n - 5} lead khác`);
  lines.push('');
  lines.push('Mở CRM để xem chi tiết.');
  return lines.join('\n');
}

const OPS_LABELS: Partial<Record<NotificationEventType, string>> = {
  fleet: 'Fleet',
  runtime: 'Runtime',
  health: 'Health',
  agent_online: 'Agent Online',
  browser_lease: 'Browser Lease',
  planner: 'Planner',
  mission_started: 'Mission Started',
  mission_finished: 'Mission Finished',
};

const PUBLISH_LABELS: Partial<Record<NotificationEventType, string>> = {
  publish_scheduled: 'Publish Scheduled',
  publishing: 'Publishing',
  publish_success: 'Publish Success',
  publish_failed: 'Publish Failed',
  retry_publish: 'Retry Publish',
};

const CRITICAL_LABELS: Partial<Record<NotificationEventType, string>> = {
  cpu_high: 'CPU > 90%',
  ram_high: 'RAM > 90%',
  scheduler_down: 'Scheduler Down',
  browser_crash: 'Browser Crash',
  execution_agent_offline: 'Execution Agent Offline',
  heartbeat_lost: 'Heartbeat Lost',
  fleet_zero: 'Fleet = 0',
};

function channelHeader(channel: NotificationChannel): string {
  return CHANNEL_LABELS[channel];
}

export function formatRoutedNotification(
  channel: NotificationChannel,
  type: NotificationEventType,
  payload: NotificationPayload,
): string {
  const lines: string[] = [channelHeader(channel)];

  if (channel === 'OPS') {
    const label = OPS_LABELS[type] || type;
    const id = payload.entityId || payload.agentId || '—';
    lines.push(`${label}: ${id}`);
    if (payload.summary) lines.push(String(payload.summary).slice(0, 400));
    if (payload.recommendation) {
      lines.push('');
      lines.push(`💡 ${String(payload.recommendation).slice(0, 300)}`);
    }
    if (payload.detail) lines.push(String(payload.detail).slice(0, 200));
  } else if (channel === 'PUBLISH') {
    const label = PUBLISH_LABELS[type] || type;
    const id = payload.publishJobId || payload.entityId || '—';
    lines.push(`${label}`);
    lines.push(`Job: ${id}`);
    if (payload.summary) lines.push(String(payload.summary).slice(0, 400));
    if (payload.recommendation) {
      lines.push('');
      lines.push(`💡 ${String(payload.recommendation).slice(0, 300)}`);
    }
    if (payload.detail) lines.push(String(payload.detail).slice(0, 200));
  } else if (channel === 'REPORT') {
    const slot =
      type === 'daily_08'
        ? '08:00'
        : type === 'daily_12'
          ? '12:00'
          : type === 'daily_18'
            ? '18:00'
            : type === 'weekly'
              ? 'Weekly'
              : 'Report';
    lines.push(`Báo cáo ${slot}`);
    if (payload.summary) lines.push(String(payload.summary).slice(0, 3500));
    else if (payload.title) lines.push(String(payload.title).slice(0, 500));
    if (payload.recommendation) {
      lines.push('');
      lines.push(`💡 ${String(payload.recommendation).slice(0, 400)}`);
    }
  } else if (channel === 'CRITICAL') {
    const label = CRITICAL_LABELS[type] || type;
    lines.push(`⚠️ ${label}`);
    if (payload.summary) lines.push(String(payload.summary).slice(0, 400));
    if (payload.detail) lines.push(String(payload.detail).slice(0, 200));
    if (payload.recommendation) {
      lines.push('');
      lines.push(`→ ${String(payload.recommendation).slice(0, 300)}`);
    }
  } else if (channel === 'LEAD') {
    // NEW_LEAD_DIGEST (batched)
    if (payload.batchCount && payload.batchCount > 1) {
      return formatBatchedLeadSummary(payload.batchItems || []);
    }
    // Single NEW_LEAD: ONLY canonical Sales Action Card — fail closed otherwise.
    const summary = payload.summary != null ? String(payload.summary) : '';
    if (summary.includes(CANONICAL_LEAD_ALERT_MARKER)) {
      return summary.slice(0, 4000);
    }
    // Never invent 🎯 Lead Alerts / Score: N/100 / Expected Deal card.
    return '';
  }

  if (payload.extraLines?.length) {
    lines.push('');
    lines.push(...payload.extraLines.map(l => String(l).slice(0, 300)));
  }

  return lines.filter(Boolean).join('\n').trim();
}

/** One-line bullet for batched OPS alerts */
export function formatOpsBullet(
  type: NotificationEventType,
  payload: NotificationPayload,
): string {
  const label = OPS_LABELS[type] || type;
  const id = payload.entityId || payload.agentId || '—';
  if (payload.detail) return `• ${label}: ${id} — ${String(payload.detail).slice(0, 80)}`;
  return `• ${label}: ${id}`;
}

export function keyboardForChannel(
  channel: NotificationChannel,
  type: NotificationEventType,
  payload: NotificationPayload,
): InlineKeyboard | undefined {
  const entityId = payload.entityId || payload.publishJobId || payload.agentId || payload.findingId;

  if (channel === 'OPS') {
    return opsActionKeyboard(entityId);
  }
  if (channel === 'LEAD' && payload.findingId) {
    return leadAlertKeyboard({
      findingId: payload.findingId,
      postUrl: payload.postUrl,
      groupUrl: payload.groupUrl,
    });
  }
  if (channel === 'PUBLISH' && payload.publishJobId) {
    const kb = publishJobKeyboard(payload.publishJobId);
    if (payload.evidenceUrl && /^https:\/\//i.test(payload.evidenceUrl)) {
      kb.inline_keyboard.unshift([{ text: 'Open Evidence', url: payload.evidenceUrl }]);
    }
    return kb;
  }
  if (channel === 'REPORT') {
    return {
      inline_keyboard: [
        [
          { text: 'Dashboard', callback_data: 'o:f:report' },
          { text: 'Runtime', callback_data: 'o:r:report' },
        ],
      ],
    };
  }
  if (channel === 'CRITICAL') {
    const id = payload.agentId || entityId || 'critical';
    return {
      inline_keyboard: [
        [
          { text: 'Recover', callback_data: `b:r:${id}` },
          { text: 'Restart Browser', callback_data: `b:t:${id}` },
        ],
        [
          { text: 'Restart Agent', callback_data: `k:a:${id}` },
          { text: 'Dashboard', callback_data: 'o:f:ops' },
        ],
      ],
    };
  }
  if (type === 'browser_crash' || type === 'execution_agent_offline') {
    return incidentKeyboard(String(entityId || 'incident'));
  }
  return undefined;
}
