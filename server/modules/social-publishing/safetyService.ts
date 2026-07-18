import crypto from 'crypto';
import type { SocialChannel } from '@prisma/client';
import { prisma } from '../../prisma';
import {
  DEFAULT_SAFETY_SETTINGS,
  type ChannelStatus,
  type PublishErrorCode,
} from './types';

export function hashBody(body: string): string {
  return crypto.createHash('sha256').update(body, 'utf8').digest('hex');
}

export function normalizeBody(body: string): string {
  return body
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

export function fingerprintBody(body: string): { bodyHash: string; normalizedBodyHash: string } {
  const normalized = normalizeBody(body);
  return {
    bodyHash: hashBody(body),
    normalizedBodyHash: hashBody(normalized),
  };
}

/** Pure daily-cap check (no DB) — for unit tests and callers with a known count. */
export function isDailyCapAllowed(count: number, maxPostsPerDay = DEFAULT_SAFETY_SETTINGS.maxPostsPerDay): boolean {
  return count < maxPostsPerDay;
}

/** Pure spacing check given last publish time. */
export function isSpacingAllowed(
  lastPublishedAt: Date | null,
  now = new Date(),
  minSpacingMinutes = DEFAULT_SAFETY_SETTINGS.minSpacingMinutes,
): boolean {
  if (!lastPublishedAt) return true;
  return now.getTime() - lastPublishedAt.getTime() >= minSpacingMinutes * 60_000;
}

/**
 * Schedule endpoint requires prior approval.
 * Combined approve+schedule goes through /approve with channelId+scheduledAt.
 */
export function canScheduleDraftStatus(status: string): boolean {
  return status === 'approved' || status === 'scheduled';
}

/** Channel lock: statuses that mean another publish is in flight on the channel. */
export function isActivePublishJobStatus(status: string): boolean {
  return status === 'claimed' || status === 'preparing' || status === 'publishing';
}

export function hasActiveChannelJob(
  jobs: Array<{ id: string; status: string }>,
  channelIdIgnored?: string,
  excludeJobId?: string,
): boolean {
  void channelIdIgnored;
  return jobs.some(
    j => j.id !== excludeJobId && isActivePublishJobStatus(j.status),
  );
}

/** Map publisher/auth failures to channel needs_login. */
export function mapNeedsLoginErrorCode(errorCode?: string | null): boolean {
  return (
    errorCode === 'channel_needs_login' ||
    errorCode === 'browser_auth_blocked' ||
    errorCode === 'graph_token_expired'
  );
}

function startOfDayInTimezone(now: Date, timezone = 'Asia/Ho_Chi_Minh'): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (y && m && d) {
      // Approximate local midnight as UTC midnight of that calendar date (good enough for cap).
      return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
    }
  } catch {
    // fall through
  }
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export async function checkDailyCap(
  channelId: string,
  now = new Date(),
  timezone = 'Asia/Ho_Chi_Minh',
  maxPostsPerDay = DEFAULT_SAFETY_SETTINGS.maxPostsPerDay,
): Promise<{ allowed: boolean; count: number; max: number }> {
  const dayStart = startOfDayInTimezone(now, timezone);
  const count = await prisma.socialPublishJob.count({
    where: {
      channelId,
      status: 'published',
      completedAt: { gte: dayStart },
    },
  });
  return {
    allowed: count < maxPostsPerDay,
    count,
    max: maxPostsPerDay,
  };
}

export async function checkSpacing(
  channelId: string,
  now = new Date(),
  minSpacingMinutes = DEFAULT_SAFETY_SETTINGS.minSpacingMinutes,
): Promise<{ allowed: boolean; lastPublishedAt: Date | null; minSpacingMinutes: number }> {
  const last = await prisma.socialPublishJob.findFirst({
    where: { channelId, status: 'published', completedAt: { not: null } },
    orderBy: { completedAt: 'desc' },
    select: { completedAt: true },
  });
  const lastPublishedAt = last?.completedAt ?? null;
  if (!lastPublishedAt) {
    return { allowed: true, lastPublishedAt: null, minSpacingMinutes };
  }
  const elapsedMs = now.getTime() - lastPublishedAt.getTime();
  const minMs = minSpacingMinutes * 60_000;
  return {
    allowed: elapsedMs >= minMs,
    lastPublishedAt,
    minSpacingMinutes,
  };
}

export async function checkDuplicate(input: {
  companyId?: string | null;
  channelId: string;
  bodyHash?: string | null;
  normalizedHash?: string | null;
  windowDays?: number;
}): Promise<{ duplicate: boolean; overrideAllowed: boolean; matchedJobId?: string }> {
  const windowDays = input.windowDays ?? DEFAULT_SAFETY_SETTINGS.duplicateWindowDays;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  if (!input.bodyHash && !input.normalizedHash) {
    return { duplicate: false, overrideAllowed: true };
  }

  const drafts = await prisma.socialPostDraft.findMany({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      OR: [
        ...(input.bodyHash ? [{ bodyHash: input.bodyHash }] : []),
        ...(input.normalizedHash ? [{ normalizedBodyHash: input.normalizedHash }] : []),
      ],
    },
    select: { id: true },
    take: 50,
  });

  if (drafts.length === 0) {
    return { duplicate: false, overrideAllowed: true };
  }

  const draftIds = drafts.map(d => d.id);
  const candidates = await prisma.socialPublishJob.findMany({
    where: {
      channelId: input.channelId,
      draftId: { in: draftIds },
      status: 'published',
      completedAt: { gte: since },
    },
    select: { id: true, result: true },
    orderBy: { completedAt: 'desc' },
    take: 30,
  });

  // Dry-run / stub publishes must not block a later live publish of the same content.
  const matched = candidates.find(job => {
    const result =
      job.result && typeof job.result === 'object'
        ? (job.result as Record<string, unknown>)
        : null;
    if (result?.dryRun === true) return false;
    const urlCandidates = [result?.facebookPostUrl, result?.externalUrl, result?.publishedUrl];
    for (const raw of urlCandidates) {
      if (typeof raw === 'string' && /story_fbid=stub_/i.test(raw)) return false;
    }
    return true;
  });

  return {
    duplicate: Boolean(matched),
    overrideAllowed: true,
    matchedJobId: matched?.id,
  };
}

export function assertChannelPublishable(channel: SocialChannel): {
  ok: boolean;
  errorCode?: PublishErrorCode;
  errorMessage?: string;
} {
  if (!channel.isActive) {
    return { ok: false, errorCode: 'channel_inactive', errorMessage: 'Channel is inactive' };
  }
  const status = channel.status as ChannelStatus;
  if (status === 'paused') {
    return { ok: false, errorCode: 'channel_paused', errorMessage: 'Channel is paused' };
  }
  if (status === 'needs_login') {
    return {
      ok: false,
      errorCode: 'channel_needs_login',
      errorMessage: 'Channel needs login / session refresh',
    };
  }
  if (status === 'error' && channel.consecutiveFailures >= DEFAULT_SAFETY_SETTINGS.pauseAfterConsecutiveFailures) {
    return {
      ok: false,
      errorCode: 'channel_paused',
      errorMessage: 'Channel paused after consecutive failures',
    };
  }
  return { ok: true };
}
