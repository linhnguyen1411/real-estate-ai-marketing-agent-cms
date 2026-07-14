/**
 * Dedup + idempotency helpers for pipeline ingest / conversion.
 */

import crypto from 'crypto';
import { prisma } from '../prisma';
import { getCustomers } from '../dbHelper';
import { normalizeVietnamPhone } from '../agent/extractors/phoneExtractor';

export type IdempotencyResult = {
  key: string;
  resourceType: string;
  resourceId: string;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/** Normalize VN phone to digits (0xxxxxxxxx). Returns null if invalid. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('fb:') || trimmed.startsWith('nopphone:') || trimmed.startsWith('post:')) {
    return null;
  }
  const parsed = normalizeVietnamPhone(trimmed);
  if (parsed?.valid) return parsed.normalized;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`;
  if (digits.startsWith('0') && digits.length >= 10) return digits;
  return digits.length >= 9 ? digits : null;
}

/** Canonical Facebook profile / page URL for matching. */
export function normalizeFacebookUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    // Keep profile.php?id= only; strip other query params
    if (parsed.pathname.includes('profile.php') && parsed.searchParams.get('id')) {
      const id = parsed.searchParams.get('id');
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}?id=${id}`;
    }
    parsed.search = '';
    const path = (parsed.pathname || '/').replace(/\/+$/, '') || '/';
    parsed.pathname = path;
    return parsed.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase() || null;
  }
}

export async function findLeadByPhone(phone: string | null | undefined) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return prisma.lead.findFirst({
    where: { phone: normalized },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function findLeadByFb(facebookUrl: string | null | undefined) {
  const normalized = normalizeFacebookUrl(facebookUrl);
  if (!normalized) return null;

  const byEvent = await prisma.leadEvent.findFirst({
    where: {
      eventType: { in: ['agent_promote', 'facebook_profile', 'call_status', 'converted_to_customer'] },
      OR: [
        { eventData: { path: ['facebookProfileUrl'], equals: normalized } },
        { eventData: { path: ['facebook_url'], equals: normalized } },
        { eventData: { path: ['facebookProfileUrl'], equals: facebookUrl } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (byEvent?.leadId) {
    return prisma.lead.findUnique({ where: { id: byEvent.leadId } });
  }
  return null;
}

export async function findLeadByUrl(canonicalUrl: string | null | undefined) {
  if (!canonicalUrl || !canonicalUrl.trim()) return null;
  const url = canonicalUrl.trim();

  const byEvent = await prisma.leadEvent.findFirst({
    where: {
      eventType: { in: ['agent_promote', 'source_url'] },
      OR: [
        { eventData: { path: ['sourcePostUrl'], equals: url } },
        { eventData: { path: ['source_post_url'], equals: url } },
        { pagePath: url },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (byEvent?.leadId) {
    return prisma.lead.findUnique({ where: { id: byEvent.leadId } });
  }

  return prisma.lead.findFirst({
    where: { pagePath: url },
    orderBy: { updatedAt: 'desc' },
  });
}

export function findCustomerByPhone(phone: string | null | undefined) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const customers = getCustomers() as Array<{ id: string; phone?: string; [k: string]: unknown }>;
  return (
    customers.find(c => {
      const cNorm = normalizePhone(typeof c.phone === 'string' ? c.phone : null);
      return cNorm && cNorm === normalized;
    }) || null
  );
}

export type PropertyDupeHeuristicInput = {
  companyId?: string | null;
  sourceUrl?: string | null;
  contentHash?: string | null;
  contactPhone?: string | null;
  title?: string | null;
  city?: string | null;
  district?: string | null;
  askingPriceMin?: bigint | number | null;
  areaMinM2?: number | null;
};

/**
 * Heuristic duplicate lookup for ExternalInventoryItem (and similar property-like rows).
 */
export async function findPropertyDupe(input: PropertyDupeHeuristicInput): Promise<{
  id: string;
  reason: string;
} | null> {
  const scope = input.companyId ? { companyId: input.companyId } : {};

  if (input.sourceUrl) {
    const byUrl = await prisma.externalInventoryItem.findFirst({
      where: { ...scope, sourceUrl: input.sourceUrl, status: { not: 'dismissed' } },
      select: { id: true },
    });
    if (byUrl) return { id: byUrl.id, reason: 'canonicalUrl' };
  }

  if (input.contentHash) {
    const byHash = await prisma.externalInventoryItem.findFirst({
      where: { ...scope, contentHash: input.contentHash, status: { not: 'dismissed' } },
      select: { id: true },
    });
    if (byHash) return { id: byHash.id, reason: 'contentHash' };
  }

  const phone = normalizePhone(input.contactPhone);
  if (phone && input.title) {
    const byPhoneTitle = await prisma.externalInventoryItem.findFirst({
      where: {
        ...scope,
        contactPhone: phone,
        title: input.title,
        status: { not: 'dismissed' },
      },
      select: { id: true },
    });
    if (byPhoneTitle) return { id: byPhoneTitle.id, reason: 'phone+title' };
  }

  if (input.city && input.askingPriceMin != null && input.areaMinM2 != null) {
    const price =
      typeof input.askingPriceMin === 'bigint' ? input.askingPriceMin : BigInt(Math.floor(Number(input.askingPriceMin)));
    const byLoc = await prisma.externalInventoryItem.findFirst({
      where: {
        ...scope,
        city: input.city,
        askingPriceMin: price,
        areaMinM2: input.areaMinM2,
        status: { not: 'dismissed' },
      },
      select: { id: true },
    });
    if (byLoc) return { id: byLoc.id, reason: 'location+price+area' };
  }

  if (input.city && input.district && phone) {
    const byDistrictPhone = await prisma.externalInventoryItem.findFirst({
      where: {
        ...scope,
        city: input.city,
        district: input.district,
        contactPhone: phone,
        status: { not: 'dismissed' },
      },
      select: { id: true },
    });
    if (byDistrictPhone) return { id: byDistrictPhone.id, reason: 'city+district+phone' };
  }

  return null;
}

function hasAgentIngestionEventModel(): boolean {
  return typeof (prisma as { agentIngestionEvent?: unknown }).agentIngestionEvent !== 'undefined';
}

/**
 * Lookup a previously stored idempotency key.
 * Prefers AgentIngestionEvent when present; otherwise LeadEvent / ExternalInventoryEvent
 * with eventType `idempotency:{key}`.
 */
export async function getIdempotencyResult(key: string): Promise<IdempotencyResult | null> {
  if (!key) return null;
  const eventType = `idempotency:${key}`;

  if (hasAgentIngestionEventModel()) {
    const row = await (prisma as any).agentIngestionEvent.findFirst({
      where: { OR: [{ idempotencyKey: key }, { eventKey: key }, { eventType }] },
      orderBy: { createdAt: 'desc' },
    });
    if (row) {
      return {
        key,
        resourceType: row.resourceType || row.entityType || 'unknown',
        resourceId: row.resourceId || row.entityId || row.id,
      };
    }
  }

  const leadEvt = await prisma.leadEvent.findFirst({
    where: { eventType },
    orderBy: { createdAt: 'desc' },
  });
  if (leadEvt) {
    const data = (leadEvt.eventData || {}) as Record<string, unknown>;
    return {
      key,
      resourceType: String(data.resourceType || 'lead'),
      resourceId: String(data.resourceId || leadEvt.leadId || leadEvt.id),
    };
  }

  const extEvt = await prisma.externalInventoryEvent.findFirst({
    where: { eventType },
    orderBy: { createdAt: 'desc' },
  });
  if (extEvt) {
    const data = (extEvt.metadata || {}) as Record<string, unknown>;
    return {
      key,
      resourceType: String(data.resourceType || 'external_inventory'),
      resourceId: String(data.resourceId || extEvt.itemId || extEvt.id),
    };
  }

  return null;
}

/**
 * Persist an idempotency key → resource mapping.
 * Expected schema (AgentIngestionEvent): idempotencyKey, resourceType, resourceId.
 */
export async function saveIdempotencyResult(
  key: string,
  resourceType: string,
  resourceId: string,
): Promise<IdempotencyResult> {
  const eventType = `idempotency:${key}`;
  const payload = { key, resourceType, resourceId };

  if (hasAgentIngestionEventModel()) {
    await (prisma as any).agentIngestionEvent.create({
      data: {
        id: newId('aie'),
        idempotencyKey: key,
        eventType,
        resourceType,
        resourceId,
        metadata: payload,
      },
    });
    return { key, resourceType, resourceId };
  }

  // Fallback when AgentIngestionEvent is absent:
  // - lead → LeadEvent
  // - external_inventory → ExternalInventoryEvent
  // - other → LeadEvent with null leadId (eventType encodes the key)
  if (resourceType === 'external_inventory' || resourceType === 'external_inventory_item') {
    await prisma.externalInventoryEvent.create({
      data: {
        id: newId('eie'),
        itemId: resourceId,
        eventType,
        note: `idempotency ${key}`,
        metadata: payload,
      },
    });
  } else {
    await prisma.leadEvent.create({
      data: {
        id: newId('levent'),
        leadId:
          resourceType === 'lead' || resourceType === 'investor_lead' ? resourceId : null,
        eventType,
        eventData: payload,
        createdAt: new Date(),
      },
    });
  }

  return { key, resourceType, resourceId };
}
