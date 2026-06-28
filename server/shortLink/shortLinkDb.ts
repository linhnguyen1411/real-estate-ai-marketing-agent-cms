import crypto from 'crypto';
import type { ShortLink, ShortLinkAnalytics, ShortLinkClick, ShortLinkInput } from '../../src/types/shortLink';
import { prisma } from '../prisma';
import { pickUniqueSlug, normalizeShortSlug } from './slugUtils';
import { parseUserAgent } from './userAgent';

function rowToShortLink(
  row: {
    id: string;
    slug: string;
    targetUrl: string;
    title: string | null;
    description: string | null;
    entityType: string | null;
    entityId: string | null;
    campaign: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    isActive: boolean;
    expiresAt: Date | null;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  origin?: string,
  clickCount?: number,
): ShortLink {
  const shortUrl = origin ? `${origin.replace(/\/+$/, '')}/s/${row.slug}` : undefined;
  return {
    id: row.id,
    slug: row.slug,
    target_url: row.targetUrl,
    title: row.title || undefined,
    description: row.description || undefined,
    entity_type: row.entityType || undefined,
    entity_id: row.entityId || undefined,
    campaign: row.campaign || undefined,
    utm_source: row.utmSource || undefined,
    utm_medium: row.utmMedium || undefined,
    utm_campaign: row.utmCampaign || undefined,
    is_active: row.isActive,
    expires_at: row.expiresAt?.toISOString(),
    created_by: row.createdBy || undefined,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    click_count: clickCount,
    short_url: shortUrl,
  };
}

function rowToClick(row: {
  id: string;
  shortLinkId: string;
  device: string | null;
  browser: string | null;
  os: string | null;
  referer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  clickedAt: Date;
}): ShortLinkClick {
  return {
    id: row.id,
    short_link_id: row.shortLinkId,
    device: row.device || undefined,
    browser: row.browser || undefined,
    os: row.os || undefined,
    referer: row.referer || undefined,
    utm_source: row.utmSource || undefined,
    utm_medium: row.utmMedium || undefined,
    utm_campaign: row.utmCampaign || undefined,
    clicked_at: row.clickedAt.toISOString(),
  };
}

export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || 'estoria-short-link';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 24);
}

export async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const row = await prisma.shortLink.findUnique({ where: { slug } });
  if (!row) return false;
  if (excludeId && row.id === excludeId) return false;
  return true;
}

export async function getShortLinkBySlug(slug: string) {
  return prisma.shortLink.findUnique({ where: { slug: normalizeShortSlug(slug) } });
}

export async function getShortLinkByEntity(entityType: string, entityId: string) {
  return prisma.shortLink.findFirst({
    where: { entityType, entityId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function listShortLinks(origin?: string): Promise<ShortLink[]> {
  const rows = await prisma.shortLink.findMany({ orderBy: { updatedAt: 'desc' } });
  const counts = await prisma.shortLinkClick.groupBy({
    by: ['shortLinkId'],
    _count: { _all: true },
  });
  const countMap = new Map(counts.map(item => [item.shortLinkId, item._count._all]));
  return rows.map(row => rowToShortLink(row, origin, countMap.get(row.id) || 0));
}

export async function createShortLink(
  input: ShortLinkInput,
  options: { createdBy?: string; origin?: string; suggestedSlug?: string } = {},
): Promise<ShortLink> {
  const now = new Date();
  const slug = await pickUniqueSlug(
    input.slug || options.suggestedSlug || 'link',
    async candidate => slugExists(candidate),
  );

  const row = await prisma.shortLink.create({
    data: {
      id: `sl-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      slug,
      targetUrl: input.target_url,
      title: input.title || null,
      description: input.description || null,
      entityType: input.entity_type || null,
      entityId: input.entity_id || null,
      campaign: input.campaign || null,
      utmSource: input.utm_source || null,
      utmMedium: input.utm_medium || 'short_link',
      utmCampaign: input.utm_campaign || slug,
      isActive: input.is_active !== false,
      expiresAt: input.expires_at ? new Date(input.expires_at) : null,
      createdBy: options.createdBy || null,
      createdAt: now,
      updatedAt: now,
    },
  });

  return rowToShortLink(row, options.origin, 0);
}

export async function updateShortLink(
  id: string,
  input: Partial<ShortLinkInput>,
  origin?: string,
): Promise<ShortLink> {
  const current = await prisma.shortLink.findUniqueOrThrow({ where: { id } });
  let slug = current.slug;

  if (input.slug && normalizeShortSlug(input.slug) !== current.slug) {
    slug = await pickUniqueSlug(
      input.slug,
      async candidate => slugExists(candidate, id),
    );
  }

  const row = await prisma.shortLink.update({
    where: { id },
    data: {
      slug,
      targetUrl: input.target_url ?? current.targetUrl,
      title: input.title !== undefined ? input.title || null : current.title,
      description: input.description !== undefined ? input.description || null : current.description,
      entityType: input.entity_type !== undefined ? input.entity_type || null : current.entityType,
      entityId: input.entity_id !== undefined ? input.entity_id || null : current.entityId,
      campaign: input.campaign !== undefined ? input.campaign || null : current.campaign,
      utmSource: input.utm_source !== undefined ? input.utm_source || null : current.utmSource,
      utmMedium: input.utm_medium !== undefined ? input.utm_medium || null : current.utmMedium,
      utmCampaign: input.utm_campaign !== undefined ? input.utm_campaign || null : current.utmCampaign,
      isActive: input.is_active !== undefined ? input.is_active : current.isActive,
      expiresAt: input.expires_at !== undefined
        ? input.expires_at ? new Date(input.expires_at) : null
        : current.expiresAt,
      updatedAt: new Date(),
    },
  });

  const clickCount = await prisma.shortLinkClick.count({ where: { shortLinkId: id } });
  return rowToShortLink(row, origin, clickCount);
}

export async function deleteShortLink(id: string): Promise<void> {
  await prisma.shortLink.delete({ where: { id } });
}

export async function ensureShortLinkForEntity(input: {
  entityType: string;
  entityId: string;
  targetUrl: string;
  title?: string;
  description?: string;
  suggestedSlug?: string;
  createdBy?: string;
  origin?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}): Promise<ShortLink> {
  const existing = await getShortLinkByEntity(input.entityType, input.entityId);
  if (existing) {
    const clickCount = await prisma.shortLinkClick.count({ where: { shortLinkId: existing.id } });
    return rowToShortLink(existing, input.origin, clickCount);
  }

  return createShortLink(
    {
      target_url: input.targetUrl,
      title: input.title,
      description: input.description,
      entity_type: input.entityType,
      entity_id: input.entityId,
      utm_source: input.utmSource || 'share',
      utm_medium: input.utmMedium || 'short_link',
      utm_campaign: input.utmCampaign || input.suggestedSlug,
    },
    {
      createdBy: input.createdBy,
      origin: input.origin,
      suggestedSlug: input.suggestedSlug,
    },
  );
}

export function buildRedirectUrl(shortLink: {
  slug: string;
  targetUrl: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}, incomingQuery: Record<string, string | undefined> = {}): string {
  const url = new URL(shortLink.targetUrl);
  url.searchParams.set('sl', shortLink.slug);

  const utmSource = shortLink.utmSource || incomingQuery.utm_source;
  const utmMedium = shortLink.utmMedium || incomingQuery.utm_medium;
  const utmCampaign = shortLink.utmCampaign || incomingQuery.utm_campaign;

  if (utmSource) url.searchParams.set('utm_source', utmSource);
  if (utmMedium) url.searchParams.set('utm_medium', utmMedium);
  if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign);

  return url.toString();
}

export async function recordShortLinkClick(input: {
  shortLinkId: string;
  ip?: string;
  userAgent?: string;
  referer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}): Promise<void> {
  const parsed = parseUserAgent(input.userAgent || '');
  await prisma.shortLinkClick.create({
    data: {
      id: `slc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      shortLinkId: input.shortLinkId,
      ipHash: input.ip ? hashIp(input.ip) : null,
      userAgent: input.userAgent || null,
      device: parsed.device,
      browser: parsed.browser,
      os: parsed.os,
      referer: input.referer || null,
      utmSource: input.utmSource || null,
      utmMedium: input.utmMedium || null,
      utmCampaign: input.utmCampaign || null,
      clickedAt: new Date(),
    },
  });
}

export async function getShortLinkAnalytics(id: string): Promise<ShortLinkAnalytics> {
  const totalClicks = await prisma.shortLinkClick.count({ where: { shortLinkId: id } });
  const clicks = await prisma.shortLinkClick.findMany({
    where: { shortLinkId: id },
    orderBy: { clickedAt: 'desc' },
    take: 100,
  });

  const byDevice: Record<string, number> = {};
  const byBrowser: Record<string, number> = {};
  const byReferer: Record<string, number> = {};
  const deviceSet = new Set<string>();

  clicks.forEach(click => {
    const device = click.device || 'unknown';
    const browser = click.browser || 'unknown';
    const refererKey = (() => {
      if (!click.referer) return 'direct';
      try {
        return new URL(click.referer).hostname || 'direct';
      } catch {
        return click.referer.slice(0, 80);
      }
    })();
    byReferer[refererKey] = (byReferer[refererKey] || 0) + 1;
    byDevice[device] = (byDevice[device] || 0) + 1;
    byBrowser[browser] = (byBrowser[browser] || 0) + 1;
    if (click.ipHash) deviceSet.add(`${click.ipHash}:${device}`);
  });

  return {
    total_clicks: totalClicks,
    unique_devices: deviceSet.size,
    by_device: byDevice,
    by_browser: byBrowser,
    by_referer: byReferer,
    recent_clicks: clicks.map(rowToClick),
  };
}
