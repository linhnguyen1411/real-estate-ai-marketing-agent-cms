/**
 * Convert Investor Lead → CRM Customer (create or merge by phone).
 *
 * Expected Lead schema fields (not yet in prisma):
 * - convertedCustomerId, convertedAt, convertedBy
 * Until migrated, status=`converted_to_customer` + LeadEvent carries the mapping.
 */

import crypto from 'crypto';
import type { AuthUser } from '../src/types';
import { prisma } from './prisma';
import { createCustomer, updateCustomer } from './dbHelper';
import { findCustomerByPhone, normalizePhone } from './dataLifecycle/entityDedupService';
import type { InvestorLeadPromoteDetail } from '../src/types/investorLead';

export type ConvertInvestorLeadOutcome = 'created' | 'merged' | 'existing';

export type ConvertInvestorLeadResult = {
  customerId: string;
  outcome: ConvertInvestorLeadOutcome;
  leadId: string;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function asPromoteDetail(value: unknown): InvestorLeadPromoteDetail | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as InvestorLeadPromoteDetail;
}

/** @internal exported for unit tests */
export function parseBudgetBillions(budgetRange: string | null | undefined, detail: InvestorLeadPromoteDetail | null): number {
  if (detail?.buyerBudgetMax != null && Number.isFinite(Number(detail.buyerBudgetMax))) {
    return Number(detail.buyerBudgetMax) / 1_000_000_000;
  }
  if (detail?.buyerBudgetMin != null && Number.isFinite(Number(detail.buyerBudgetMin))) {
    return Number(detail.buyerBudgetMin) / 1_000_000_000;
  }
  const raw = String(budgetRange || '').toLowerCase();
  if (raw.includes('over-10') || raw.includes('>10') || raw.includes('trên 10')) return 10;
  if (raw.includes('5-10')) return 7.5;
  if (raw.includes('3-5')) return 4;
  if (raw.includes('under-3') || raw.includes('<3')) return 2;
  const num = Number(String(budgetRange || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/** @internal exported for unit tests */
export function mapPropertyType(interest: string | null | undefined, types: string[] | undefined): string {
  const joined = [interest, ...(types || [])].filter(Boolean).join(' ').toLowerCase();
  if (/đất|dat|land|lô/.test(joined)) return 'Đất nền';
  if (/căn hộ|can ho|apartment/.test(joined)) return 'Căn Hộ';
  if (/nhà phố|nha pho|townhouse/.test(joined)) return 'Nhà Phố';
  if (/shophouse/.test(joined)) return 'Shophouse';
  if (/biệt thự|biet thu|villa/.test(joined)) return 'Biệt thự';
  if (/kho|xưởng|xuong/.test(joined)) return 'Kho xưởng';
  if (/khách sạn|khach san|hotel/.test(joined)) return 'Khách sạn';
  if (/nhà hàng|nha hang/.test(joined)) return 'Nhà hàng';
  return 'Khác';
}

function buildCustomerNotes(
  lead: {
    name: string;
    phone: string;
    city: string | null;
    budgetRange: string | null;
    interestType: string | null;
    firstMessage: string | null;
    source: string | null;
  },
  detail: InvestorLeadPromoteDetail | null,
): string {
  const parts = [
    lead.firstMessage?.trim() || null,
    detail?.needSummary ? `Nhu cầu: ${detail.needSummary}` : null,
    detail?.summary && detail.summary !== detail.needSummary ? `Tóm tắt: ${detail.summary}` : null,
    detail?.recommendedAction ? `Gợi ý: ${detail.recommendedAction}` : null,
    detail?.sourcePostUrl ? `Bài gốc: ${detail.sourcePostUrl}` : null,
  ].filter(Boolean);
  return parts.join('\n\n').slice(0, 12000);
}

function buildAiSummary(detail: InvestorLeadPromoteDetail | null, firstMessage: string | null): string {
  if (detail?.needSummary) return detail.needSummary;
  if (detail?.summary) return detail.summary;
  if (firstMessage) return firstMessage.slice(0, 500);
  return '';
}

function buildExtendedFields(
  lead: {
    id: string;
    status: string;
    city: string | null;
    budgetRange: string | null;
    interestType: string | null;
    pagePath: string | null;
    firstMessage: string | null;
    source: string | null;
    channel: string | null;
  },
  detail: InvestorLeadPromoteDetail | null,
) {
  return {
    // Extended CRM JSON-ish fields (stored on customer record; CMS cache is schemaless)
    need_summary: detail?.needSummary ?? null,
    budget_text: detail?.budgetRange || lead.budgetRange || null,
    locations: [detail?.location, detail?.city, detail?.district, lead.city].filter(Boolean),
    property_types: detail?.propertyTypes || (lead.interestType ? [lead.interestType] : []),
    facebook_url: detail?.facebookProfileUrl ?? null,
    source_post_url: detail?.sourcePostUrl || lead.pagePath || null,
    original_content: detail?.originalContent ?? null,
    investor_lead_id: lead.id,
    follow_up_status: lead.status,
    classification: detail?.classification ?? null,
    intent: detail?.intent ?? null,
    priority: detail?.priority ?? null,
    lead_score_detail: detail?.leadScore ?? null,
    source_group: detail?.sourceGroup ?? null,
    source_name: detail?.sourceName ?? null,
    source_type: detail?.sourceType ?? null,
    emails: detail?.emails ?? null,
    zalo: detail?.zalo ?? null,
    phones: detail?.phones ?? null,
    requirements: detail?.requirements ?? null,
    features: detail?.features ?? null,
  };
}

function getConvertedCustomerIdFromLead(lead: Record<string, unknown>): string | null {
  const direct = lead.convertedCustomerId ?? lead.converted_customer_id;
  if (typeof direct === 'string' && direct) return direct;
  return null;
}

export async function convertInvestorLeadToCustomer(input: {
  leadId: string;
  user: AuthUser;
}): Promise<ConvertInvestorLeadResult> {
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new Error('Không tìm thấy lead.');

  const leadRow = lead as unknown as Record<string, unknown>;

  // Already converted — return existing mapping
  if (lead.status === 'converted_to_customer') {
    let existingId = getConvertedCustomerIdFromLead(leadRow);
    if (!existingId) {
      const evt = await prisma.leadEvent.findFirst({
        where: { leadId: lead.id, eventType: 'converted_to_customer' },
        orderBy: { createdAt: 'desc' },
      });
      const data = (evt?.eventData || {}) as Record<string, unknown>;
      if (typeof data.customerId === 'string') existingId = data.customerId;
    }
    if (existingId) {
      return { customerId: existingId, outcome: 'existing', leadId: lead.id };
    }
  }

  const promoteEvt = await prisma.leadEvent.findFirst({
    where: { leadId: lead.id, eventType: 'agent_promote' },
    orderBy: { createdAt: 'desc' },
  });
  const detail = asPromoteDetail(promoteEvt?.eventData);

  const phone = normalizePhone(lead.phone) || lead.phone;
  const existingCustomer = findCustomerByPhone(phone);
  const now = new Date();
  const notes = buildCustomerNotes(lead, detail);
  const aiSummary = buildAiSummary(detail, lead.firstMessage);
  const extended = buildExtendedFields(lead, detail);
  const customerCore = {
    name: lead.name || detail?.personName || 'Khách từ Investor Lead',
    phone,
    email: lead.email || detail?.emails?.[0] || '',
    source: (lead.channel === 'facebook' || lead.source?.includes('facebook')
      ? 'facebook'
      : lead.channel === 'zalo'
        ? 'zalo'
        : lead.channel === 'tiktok'
          ? 'tiktok'
          : lead.channel === 'website' || lead.source === 'website'
            ? 'website'
            : 'referral') as 'facebook' | 'zalo' | 'tiktok' | 'website' | 'referral',
    budget: parseBudgetBillions(lead.budgetRange, detail),
    interested_area:
      detail?.location ||
      [detail?.district, detail?.city || lead.city].filter(Boolean).join(', ') ||
      lead.city ||
      '',
    property_type: mapPropertyType(lead.interestType, detail?.propertyTypes),
    status: 'warm' as const,
    notes,
    ai_summary: aiSummary,
    lead_score: Math.min(100, Math.max(0, lead.investorScore || detail?.leadScore || 0)),
    company_id: input.user.company_id,
    owner_user_id: input.user.id,
    ...extended,
  };

  let customerId: string;
  let outcome: ConvertInvestorLeadOutcome;

  if (existingCustomer) {
    outcome = 'merged';
    customerId = existingCustomer.id;
    const mergedNotes = [String(existingCustomer.notes || ''), notes].filter(Boolean).join('\n\n---\n\n');
    await updateCustomer(customerId, {
      ...customerCore,
      name: existingCustomer.name || customerCore.name,
      notes: mergedNotes.slice(0, 12000),
      ai_summary: customerCore.ai_summary || String(existingCustomer.ai_summary || ''),
      lead_score: Math.max(
        Number(existingCustomer.lead_score) || 0,
        customerCore.lead_score,
      ),
    });
  } else {
    outcome = 'created';
    const created = await createCustomer({
      id: newId('c-lead'),
      ...customerCore,
      created_at: now.toISOString(),
    });
    customerId = created.id;
  }

  // Update lead status; optional converted* columns when schema has them
  const leadUpdateBase = {
    status: 'converted_to_customer',
    updatedAt: now,
  };
  try {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        ...leadUpdateBase,
        // Expected columns — cast until migration lands
        ...({
          convertedCustomerId: customerId,
          convertedAt: now,
          convertedBy: input.user.id,
        } as object),
      } as Parameters<typeof prisma.lead.update>[0]['data'],
    });
  } catch {
    await prisma.lead.update({
      where: { id: lead.id },
      data: leadUpdateBase,
    });
  }

  await prisma.leadEvent.create({
    data: {
      id: newId('levent'),
      leadId: lead.id,
      eventType: 'converted_to_customer',
      eventData: {
        customerId,
        outcome,
        convertedBy: input.user.id,
        convertedAt: now.toISOString(),
        phone,
      },
      createdAt: now,
    },
  });

  return { customerId, outcome, leadId: lead.id };
}
