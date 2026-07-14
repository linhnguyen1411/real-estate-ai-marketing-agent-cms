import crypto from 'crypto';
import type { InvestorLead, LeadCapturePayload, LeadEvent } from '../src/types/investorLead';
import { prisma } from './prisma';

function parseIsoDate(value: unknown, fallback = new Date()): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function asPromoteDetail(value: unknown): InvestorLead['promote_detail'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as InvestorLead['promote_detail'];
}

function rowToLead(
  row: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    city: string | null;
    interestType: string | null;
    budgetRange: string | null;
    source: string | null;
    channel: string | null;
    sourceChannel?: string | null;
    sourceType?: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    pagePath: string | null;
    magnetSlug: string | null;
    shortLinkSlug: string | null;
    firstMessage?: string | null;
    investorScore: number;
    status: string;
    accessToken: string | null;
    emailsSent: number;
    createdAt: Date;
    updatedAt: Date;
  },
  tags: string[] = [],
  promoteDetail: InvestorLead['promote_detail'] = null,
): InvestorLead {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || undefined,
    city: row.city || undefined,
    interest_type: row.interestType || undefined,
    budget_range: row.budgetRange || undefined,
    source: row.source || undefined,
    channel: row.channel || undefined,
    source_channel: row.sourceChannel || undefined,
    source_type: row.sourceType || undefined,
    utm_source: row.utmSource || undefined,
    utm_medium: row.utmMedium || undefined,
    utm_campaign: row.utmCampaign || undefined,
    page_path: row.pagePath || undefined,
    magnet_slug: row.magnetSlug || undefined,
    short_link_slug: row.shortLinkSlug || undefined,
    first_message: row.firstMessage || undefined,
    investor_score: row.investorScore,
    status: (row.status as InvestorLead['status']) || 'new',
    access_token: row.accessToken || undefined,
    emails_sent: row.emailsSent,
    promote_detail: promoteDetail,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    tags,
  };
}

async function getLeadTags(leadId: string): Promise<string[]> {
  const rows = await prisma.leadTag.findMany({
    where: { leadId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => row.tag);
}

export function calculateInvestorScore(input: {
  budget_range?: string;
  city?: string;
  interest_type?: string;
  source?: string;
}): { total: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = { base: 10 };

  if (input.budget_range === 'over-10') breakdown.budget = 50;
  else if (input.budget_range === '5-10') breakdown.budget = 30;
  else if (input.budget_range === '3-5') breakdown.budget = 15;

  const cityNorm = String(input.city || '').toLowerCase();
  if (cityNorm.includes('ha noi') || cityNorm.includes('hà nội') || cityNorm.includes('hanoi')) {
    breakdown.hanoi = 30;
  }

  if (input.interest_type) breakdown.investment_interest = 20;

  if (input.source?.includes('exit_intent') || input.source?.includes('lead_magnet')) {
    breakdown.high_intent = 10;
  }

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  return { total, breakdown };
}

export async function createInvestorLead(
  payload: LeadCapturePayload,
  score: { total: number; breakdown: Record<string, number> }
): Promise<InvestorLead> {
  const now = new Date();
  const id = `lead-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const accessToken = crypto.randomBytes(24).toString('hex');

  const existing = await prisma.lead.findFirst({
    where: { phone: payload.phone.trim() },
    orderBy: { createdAt: 'desc' },
  });

  const leadId = existing?.id || id;
  const isUpdate = Boolean(existing);

  if (isUpdate && existing) {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        name: payload.name.trim(),
        email: payload.email?.trim() || existing.email,
        city: payload.city?.trim() || existing.city,
        interestType: payload.interest_type || existing.interestType,
        budgetRange: payload.budget_range || existing.budgetRange,
        source: payload.source || 'website',
        channel: payload.channel || existing.channel,
        pagePath: payload.page_path || existing.pagePath,
        magnetSlug: payload.magnet_slug || existing.magnetSlug,
        shortLinkSlug: payload.short_link_slug || existing.shortLinkSlug,
        utmSource: payload.utm_source || existing.utmSource,
        utmMedium: payload.utm_medium || existing.utmMedium,
        utmCampaign: payload.utm_campaign || existing.utmCampaign,
        investorScore: Math.max(existing.investorScore, score.total),
        accessToken,
        updatedAt: now,
      },
    });
  } else {
    await prisma.lead.create({
      data: {
        id: leadId,
        name: payload.name.trim(),
        phone: payload.phone.trim(),
        email: payload.email?.trim() || null,
        city: payload.city?.trim() || null,
        interestType: payload.interest_type || null,
        budgetRange: payload.budget_range || null,
        source: payload.source || 'website',
        channel: payload.channel || null,
        utmSource: payload.utm_source || null,
        utmMedium: payload.utm_medium || null,
        utmCampaign: payload.utm_campaign || null,
        pagePath: payload.page_path || null,
        magnetSlug: payload.magnet_slug || null,
        shortLinkSlug: payload.short_link_slug || null,
        investorScore: score.total,
        status: 'new',
        accessToken,
        emailsSent: 0,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  await prisma.leadScore.create({
    data: {
      id: `score-${Date.now()}`,
      leadId,
      totalScore: score.total,
      breakdown: score.breakdown as object,
      createdAt: now,
    },
  });

  await prisma.leadSource.create({
    data: {
      id: `src-${Date.now()}`,
      leadId,
      channel: payload.channel || 'website',
      landingPage: payload.page_path || null,
      utmSource: payload.utm_source || null,
      utmMedium: payload.utm_medium || null,
      utmCampaign: payload.utm_campaign || null,
      createdAt: now,
    },
  });

  const tags = payload.tags || [];
  if (payload.form_type) tags.push(`form:${payload.form_type}`);
  if (payload.magnet_slug) tags.push(`magnet:${payload.magnet_slug}`);
  if (payload.short_link_slug) tags.push(`short:${payload.short_link_slug}`);

  for (const tag of tags) {
    try {
      await prisma.leadTag.create({
        data: {
          id: `tag-${leadId}-${tag}`,
          leadId,
          tag,
          createdAt: now,
        },
      });
    } catch {
      // duplicate tag ignored
    }
  }

  const row = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const lead = rowToLead(row, await getLeadTags(leadId));
  lead.score_breakdown = score.breakdown;
  return lead;
}

export async function recordLeadEvent(input: {
  lead_id?: string;
  session_id?: string;
  event_type: string;
  event_data?: Record<string, unknown>;
  page_path?: string;
}): Promise<LeadEvent> {
  const now = new Date();
  const id = `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  await prisma.leadEvent.create({
    data: {
      id,
      leadId: input.lead_id || null,
      sessionId: input.session_id || null,
      eventType: input.event_type,
      eventData: (input.event_data ?? undefined) as object | undefined,
      pagePath: input.page_path || null,
      createdAt: now,
    },
  });

  return {
    id,
    lead_id: input.lead_id,
    session_id: input.session_id,
    event_type: input.event_type,
    event_data: input.event_data,
    page_path: input.page_path,
    created_at: now.toISOString(),
  };
}

export async function getLeadByAccessToken(magnetSlug: string, token: string): Promise<InvestorLead | null> {
  let row = await prisma.lead.findFirst({
    where: { magnetSlug, accessToken: token },
  });

  if (!row) {
    row = await prisma.lead.findFirst({
      where: { accessToken: token },
      orderBy: { updatedAt: 'desc' },
    });
  }

  if (!row) return null;
  return rowToLead(row, await getLeadTags(row.id));
}

export async function listInvestorLeads(
  limit = 200,
  options?: { includeConverted?: boolean },
): Promise<InvestorLead[]> {
  const rows = await prisma.lead.findMany({
    where: options?.includeConverted
      ? undefined
      : { status: { not: 'converted_to_customer' } },
    orderBy: [{ investorScore: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: {
      tags: { orderBy: { createdAt: 'asc' } },
      events: {
        where: { eventType: 'agent_promote' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  return rows.map(row =>
    rowToLead(
      row,
      row.tags.map(tag => tag.tag),
      asPromoteDetail(row.events[0]?.eventData),
    ),
  );
}

export async function updateLeadStatus(id: string, status: InvestorLead['status']) {
  await prisma.lead.update({
    where: { id },
    data: { status, updatedAt: new Date() },
  });
}

export async function incrementLeadEmailsSent(id: string) {
  await prisma.lead.update({
    where: { id },
    data: { emailsSent: { increment: 1 }, updatedAt: new Date() },
  });
}

export async function getLeadEvents(leadId: string) {
  return prisma.leadEvent.findMany({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
