/**
 * Promote AgentFinding → Investor Lead (create or merge) with full intelligence payload.
 */

import crypto from 'crypto';
import { prisma } from '../prisma';
import type { AuthUser } from '../../src/types';
import { resolveLeadIntelligence } from '../../shared/agent-domain';
import { formatResolvedBudget } from '../../shared/agent-domain';
import { markFindingConsumed } from '../dataLifecycle/entityTransitionService';
import { canAccessAgentRecord } from './agentDb';

export type PromoteLeadResult = {
  outcome: 'created' | 'merged';
  leadId: string;
  leadName: string;
  phone: string;
  duplicateReason: string | null;
  findingId: string;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function serializeFinding(row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  for (const key of ['budgetMin', 'budgetMax', 'askingPrice']) {
    const val = out[key];
    if (typeof val === 'bigint') out[key] = val.toString();
  }
  return out;
}

function fallbackPhone(resolved: ReturnType<typeof resolveLeadIntelligence>, findingId: string): string {
  if (resolved.primaryPhone) return resolved.primaryPhone;
  const fb = resolved.person.facebookProfileUrl;
  if (fb) {
    const m = fb.match(/profile\.php\?id=(\d+)/) || fb.match(/facebook\.com\/(\d+)/);
    if (m?.[1]) return `fb:${m[1]}`;
    return `fb:${crypto.createHash('sha1').update(fb).digest('hex').slice(0, 12)}`;
  }
  if (resolved.source.canonicalUrl) {
    return `post:${crypto.createHash('sha1').update(resolved.source.canonicalUrl).digest('hex').slice(0, 12)}`;
  }
  return `nopphone:${findingId}`;
}

function joinLines(parts: Array<string | null | undefined>): string {
  return parts
    .map(p => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join('\n');
}

function buildPromoteDetail(resolved: ReturnType<typeof resolveLeadIntelligence>, findingId: string) {
  const budgetRange = formatResolvedBudget(
    resolved.demand.buyerBudgetMin,
    resolved.demand.buyerBudgetMax,
  );

  return {
    findingId,
    classification: resolved.classification,
    intent: resolved.intent,
    actorRole: resolved.actorRole,
    priority: resolved.priority,
    urgency: resolved.urgency,
    leadScore: resolved.finalScore,
    scoreStatus: resolved.scoreStatus,
    keywordScore: resolved.keywordScore,
    aiScore: resolved.aiScore,
    leadFitScore: resolved.leadFitScore,
    title: resolved.title,
    summary: resolved.summary,
    needSummary: resolved.demand.needSummary,
    recommendedAction: resolved.recommendedAction,
    replySuggestion: resolved.intelligence.replySuggestion,
    reasons: resolved.intelligence.reasons,
    missingInformation: resolved.intelligence.missingInformation,
    risks: resolved.intelligence.risks,
    personName: resolved.displayPersonName,
    facebookName: resolved.person.facebookName,
    facebookProfileUrl: resolved.person.facebookProfileUrl,
    phones: resolved.phones,
    primaryPhone: resolved.primaryPhone,
    emails: resolved.contact.emails,
    zalo: resolved.contact.zalo,
    budgetRange,
    buyerBudgetMin: resolved.demand.buyerBudgetMin,
    buyerBudgetMax: resolved.demand.buyerBudgetMax,
    rentBudgetMin: resolved.demand.rentBudgetMin,
    rentBudgetMax: resolved.demand.rentBudgetMax,
    purpose: resolved.demand.purpose,
    transactionTimeline: resolved.demand.transactionTimeline,
    location: resolved.location.primary,
    city: resolved.location.city,
    district: resolved.location.district,
    ward: resolved.location.ward,
    street: resolved.location.street,
    project: resolved.location.project,
    propertyTypes: resolved.property.propertyTypes,
    areaMinM2: resolved.property.areaMinM2,
    areaMaxM2: resolved.property.areaMaxM2,
    bedrooms: resolved.property.bedrooms,
    floors: resolved.property.floors,
    legalStatus: resolved.property.legalStatus,
    direction: resolved.property.direction,
    features: resolved.property.features,
    requirements: resolved.requirements.otherRequirements,
    carAccess: resolved.requirements.carAccess,
    mainRoad: resolved.requirements.mainRoad,
    nearCenter: resolved.requirements.nearCenter,
    businessUse: resolved.requirements.businessUse,
    investmentPurpose: resolved.requirements.investmentPurpose,
    sourcePostUrl: resolved.source.canonicalUrl,
    sourceGroup: resolved.source.groupName,
    sourceName: resolved.source.sourceName,
    sourceType: resolved.source.sourceType,
    authorName: resolved.source.authorName,
    authorUrl: resolved.source.authorUrl,
    publishedAt: resolved.source.publishedAt,
    collectedAt: resolved.source.collectedAt,
    originalContent: resolved.content.fullOriginalContent?.slice(0, 12000) ?? null,
    shortDescription: resolved.content.shortDescription,
  };
}

function buildFirstMessage(detail: ReturnType<typeof buildPromoteDetail>): string {
  const req =
    Array.isArray(detail.requirements) && detail.requirements.length
      ? detail.requirements.join(', ')
      : null;
  const features =
    Array.isArray(detail.features) && detail.features.length ? detail.features.join(', ') : null;
  const phones =
    Array.isArray(detail.phones) && detail.phones.length ? detail.phones.join(', ') : detail.primaryPhone;

  return joinLines([
    detail.title ? `Tiêu đề: ${detail.title}` : null,
    detail.summary ? `Tóm tắt: ${detail.summary}` : null,
    detail.needSummary && detail.needSummary !== detail.summary
      ? `Nhu cầu: ${detail.needSummary}`
      : null,
    detail.classification ? `Phân loại: ${detail.classification}` : null,
    detail.intent ? `Intent: ${detail.intent}` : null,
    detail.budgetRange && detail.budgetRange !== 'Chưa xác định'
      ? `Ngân sách: ${detail.budgetRange}`
      : null,
    detail.location ? `Khu vực: ${detail.location}` : null,
    detail.propertyTypes?.length ? `Loại BĐS: ${detail.propertyTypes.join(', ')}` : null,
    detail.areaMinM2 || detail.areaMaxM2
      ? `Diện tích: ${[detail.areaMinM2, detail.areaMaxM2].filter(Boolean).join(' - ')} m²`
      : null,
    req ? `Yêu cầu: ${req}` : null,
    features ? `Đặc điểm: ${features}` : null,
    phones ? `Điện thoại: ${phones}` : null,
    detail.zalo ? `Zalo: ${detail.zalo}` : null,
    detail.emails?.length ? `Email: ${detail.emails.join(', ')}` : null,
    detail.facebookProfileUrl ? `Facebook: ${detail.facebookProfileUrl}` : null,
    detail.sourceGroup ? `Nguồn: ${detail.sourceGroup}` : null,
    detail.sourcePostUrl ? `Bài gốc: ${detail.sourcePostUrl}` : null,
    detail.recommendedAction ? `Gợi ý xử lý: ${detail.recommendedAction}` : null,
    detail.originalContent
      ? `\n--- Nội dung gốc ---\n${detail.originalContent.slice(0, 4000)}`
      : null,
  ]);
}

async function findDuplicateLead(input: {
  phone: string | null;
  facebookUrl: string | null;
  canonicalUrl: string | null;
  personName: string | null;
}): Promise<{ lead: { id: string; name: string; phone: string; investorScore: number }; reason: string } | null> {
  if (input.phone && !input.phone.startsWith('fb:') && !input.phone.startsWith('nopphone:') && !input.phone.startsWith('post:')) {
    const byPhone = await prisma.lead.findFirst({
      where: { phone: input.phone },
      orderBy: { updatedAt: 'desc' },
    });
    if (byPhone) return { lead: byPhone, reason: 'primaryPhone' };
  }

  if (input.facebookUrl) {
    const byFb = await prisma.leadEvent.findFirst({
      where: {
        eventType: { in: ['agent_promote', 'facebook_profile'] },
        eventData: { path: ['facebookProfileUrl'], equals: input.facebookUrl },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (byFb?.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: byFb.leadId } });
      if (lead) return { lead, reason: 'facebookProfileUrl' };
    }
  }

  if (input.canonicalUrl) {
    const byUrl = await prisma.leadEvent.findFirst({
      where: {
        eventType: 'agent_promote',
        eventData: { path: ['sourcePostUrl'], equals: input.canonicalUrl },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (byUrl?.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: byUrl.leadId } });
      if (lead) return { lead, reason: 'canonicalPostUrl' };
    }
  }

  if (input.personName && input.personName !== 'Chưa xác định' && input.personName !== 'Chưa xác định tên') {
    const byName = await prisma.lead.findFirst({
      where: {
        name: input.personName,
        sourceChannel: 'agent_finding',
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (byName) return { lead: byName, reason: 'personName+source' };
  }

  if (input.phone) {
    const byPlaceholder = await prisma.lead.findFirst({
      where: { phone: input.phone },
      orderBy: { updatedAt: 'desc' },
    });
    if (byPlaceholder) return { lead: byPlaceholder, reason: 'contactKey' };
  }

  return null;
}

async function addLeadTags(leadId: string, tags: string[]) {
  const now = new Date();
  for (const tag of [...new Set(tags.map(t => t.trim()).filter(Boolean))]) {
    await prisma.leadTag.upsert({
      where: { leadId_tag: { leadId, tag } },
      create: { id: newId('ltag'), leadId, tag, createdAt: now },
      update: {},
    });
  }
}

function mergeText(existing: string | null | undefined, next: string | null | undefined): string | null {
  if (next && next.trim()) {
    if (!existing || !existing.trim()) return next;
    if (existing.startsWith('fb:') || existing.startsWith('nopphone:')) return next;
    if (next.length > existing.length * 1.2) return next;
    return existing;
  }
  return existing ?? null;
}

export async function promoteFindingToLead(input: {
  findingId: string;
  user: AuthUser;
}): Promise<PromoteLeadResult> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: input.findingId },
    include: {
      source: { select: { id: true, name: true, type: true } },
      scannedContent: true,
    },
  });
  if (!finding) throw new Error('Không tìm thấy finding.');
  if (!canAccessAgentRecord(input.user, finding.companyId)) {
    throw new Error('Không có quyền truy cập finding này.');
  }

  if (finding.promotedLeadId) {
    const existingLead = await prisma.lead.findUnique({ where: { id: finding.promotedLeadId } });
    if (existingLead) {
      return {
        outcome: 'merged',
        leadId: existingLead.id,
        leadName: existingLead.name,
        phone: existingLead.phone,
        duplicateReason: 'already_promoted',
        findingId: finding.id,
      };
    }
  }

  const resolved = resolveLeadIntelligence(serializeFinding(finding as unknown as Record<string, unknown>));
  const phone = fallbackPhone(resolved, finding.id);
  const budgetRange = formatResolvedBudget(
    resolved.demand.buyerBudgetMin,
    resolved.demand.buyerBudgetMax,
  );
  const promoteDetail = buildPromoteDetail(resolved, finding.id);
  const firstMessage = buildFirstMessage(promoteDetail);

  const dup = await findDuplicateLead({
    phone: resolved.primaryPhone || phone,
    facebookUrl: resolved.person.facebookProfileUrl,
    canonicalUrl: resolved.source.canonicalUrl,
    personName: resolved.person.name,
  });

  const now = new Date();
  const secondaryPhones = [
    ...new Set(
      [
        ...(resolved.contact.secondaryPhones || []),
        ...(resolved.phones || []).filter(p => p && p !== resolved.primaryPhone),
      ].filter(Boolean),
    ),
  ];
  const preferredLocations = [
    ...new Set(
      [
        resolved.location.primary,
        resolved.location.district,
        resolved.location.city,
        ...(resolved.location.normalizedLocations || []),
      ].filter(Boolean) as string[],
    ),
  ];
  const toBudgetBigInt = (value: string | number | null | undefined): bigint | null => {
    if (value == null || value === '') return null;
    try {
      const digits = String(value).replace(/[^\d]/g, '');
      if (!digits) return null;
      const n = BigInt(digits);
      return n > 0n ? n : null;
    } catch {
      return null;
    }
  };
  const budgetMin = toBudgetBigInt(resolved.demand.buyerBudgetMin);
  const budgetMax = toBudgetBigInt(resolved.demand.buyerBudgetMax);

  const leadEnrichment = {
    metadata: promoteDetail as object,
    findingId: finding.id,
    scannedContentId: finding.scannedContentId,
    needSummary: resolved.demand.needSummary || resolved.summary || null,
    facebookProfileUrl: resolved.person.facebookProfileUrl,
    secondaryPhones,
    preferredLocations,
    propertyTypes: resolved.property.propertyTypes || [],
    budgetMin,
    budgetMax,
    priority: resolved.priority,
    lastSeenAt: now,
  };

  const leadCoreData = {
    city: resolved.location.city || resolved.location.primary || null,
    interestType: resolved.property.propertyTypes[0] || resolved.intent || resolved.classification || null,
    budgetRange: budgetRange !== 'Chưa xác định' ? budgetRange : null,
    source: 'agent_finding',
    channel: 'agent',
    sourceChannel: 'agent_finding',
    sourceType: resolved.source.sourceType || 'facebook_group',
    pagePath: resolved.source.canonicalUrl || null,
    utmSource: 'lead_intelligence',
    utmMedium: resolved.classification || 'unknown',
    utmCampaign: finding.sourceId,
    firstMessage,
    investorScore: resolved.finalScore || 0,
    email: resolved.contact.emails[0] || null,
    updatedAt: now,
    ...leadEnrichment,
  };

  let leadId: string;
  let leadName: string;
  let leadPhone: string;
  let outcome: 'created' | 'merged';
  let duplicateReason: string | null = null;

  if (dup) {
    outcome = 'merged';
    duplicateReason = dup.reason;
    leadId = dup.lead.id;
    const realPhone =
      resolved.primaryPhone &&
      !dup.lead.phone.startsWith('fb:') &&
      !dup.lead.phone.startsWith('nopphone:') &&
      !dup.lead.phone.startsWith('post:')
        ? resolved.primaryPhone
        : resolved.primaryPhone || dup.lead.phone;

    const existing = await prisma.lead.findUnique({ where: { id: leadId } });
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        name:
          mergeText(dup.lead.name, resolved.displayPersonName) ||
          dup.lead.name,
        phone: realPhone,
        city: mergeText(existing?.city, leadCoreData.city) || undefined,
        interestType: mergeText(existing?.interestType, leadCoreData.interestType) || undefined,
        budgetRange: mergeText(existing?.budgetRange, leadCoreData.budgetRange) || undefined,
        email: mergeText(existing?.email, leadCoreData.email) || undefined,
        firstMessage: mergeText(existing?.firstMessage, firstMessage) || undefined,
        pagePath: mergeText(existing?.pagePath, leadCoreData.pagePath) || undefined,
        utmSource: leadCoreData.utmSource,
        utmMedium: leadCoreData.utmMedium,
        utmCampaign: leadCoreData.utmCampaign,
        investorScore: Math.max(dup.lead.investorScore || 0, resolved.finalScore || 0),
        source: 'agent_finding',
        channel: 'agent',
        sourceChannel: 'agent_finding',
        sourceType: leadCoreData.sourceType,
        updatedAt: now,
        metadata: leadEnrichment.metadata,
        findingId: existing?.findingId || leadEnrichment.findingId,
        scannedContentId: existing?.scannedContentId || leadEnrichment.scannedContentId,
        needSummary: mergeText(existing?.needSummary, leadEnrichment.needSummary) || undefined,
        facebookProfileUrl:
          mergeText(existing?.facebookProfileUrl, leadEnrichment.facebookProfileUrl) || undefined,
        secondaryPhones: leadEnrichment.secondaryPhones,
        preferredLocations: leadEnrichment.preferredLocations,
        propertyTypes: leadEnrichment.propertyTypes,
        budgetMin: leadEnrichment.budgetMin ?? existing?.budgetMin ?? undefined,
        budgetMax: leadEnrichment.budgetMax ?? existing?.budgetMax ?? undefined,
        priority: leadEnrichment.priority || existing?.priority || undefined,
        lastSeenAt: now,
        firstSeenAt: existing?.firstSeenAt || existing?.createdAt || now,
      },
    });
    const refreshed = await prisma.lead.findUnique({ where: { id: leadId } });
    leadName = refreshed!.name;
    leadPhone = refreshed!.phone;
  } else {
    outcome = 'created';
    leadId = newId('lead-agent');
    leadName =
      resolved.displayPersonName === 'Chưa xác định tên'
        ? 'Khách Lead Intelligence'
        : resolved.displayPersonName;
    leadPhone = phone;
    await prisma.lead.create({
      data: {
        id: leadId,
        name: leadName,
        phone: leadPhone,
        status: 'new',
        createdAt: now,
        firstSeenAt: now,
        ...leadCoreData,
      },
    });
  }

  await prisma.leadSource.create({
    data: {
      id: newId('lsrc'),
      leadId,
      channel: 'agent_finding',
      referrer: resolved.source.groupName,
      landingPage: resolved.source.canonicalUrl,
      utmSource: 'lead_intelligence',
      utmMedium: resolved.classification || 'unknown',
      utmCampaign: finding.sourceId,
      createdAt: now,
    },
  });

  if (outcome === 'created') {
    await prisma.leadScore.create({
      data: {
        id: newId('lscore'),
        leadId,
        totalScore: resolved.finalScore || 0,
        breakdown: {
          keywordScore: resolved.keywordScore,
          aiScore: resolved.aiScore,
          leadFitScore: resolved.leadFitScore,
          finalScore: resolved.finalScore,
          scoreStatus: resolved.scoreStatus,
          findingId: finding.id,
        },
        createdAt: now,
      },
    });
  }

  await prisma.leadEvent.create({
    data: {
      id: newId('levent'),
      leadId,
      eventType: 'agent_promote',
      eventData: promoteDetail,
      pagePath: resolved.source.canonicalUrl,
      createdAt: now,
    },
  });

  await addLeadTags(leadId, [
    'lead-intelligence',
    resolved.classification || 'unknown',
    resolved.intent || '',
    resolved.priority || '',
    ...(resolved.property.propertyTypes || []),
  ].filter(Boolean));

  // Prefer promoted_to_investor_lead; old clients may still read status 'promoted'
  await markFindingConsumed(prisma, {
    findingId: finding.id,
    status: 'promoted_to_investor_lead',
    consumptionType: 'investor_lead',
    resourceId: leadId,
    resourceType: 'lead',
    userId: input.user.id,
  });

  return {
    outcome,
    leadId,
    leadName,
    phone: leadPhone,
    duplicateReason,
    findingId: finding.id,
  };
}
