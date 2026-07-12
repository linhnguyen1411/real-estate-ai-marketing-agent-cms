/**
 * Build / apply structured Lead Intelligence fields onto a Finding.
 */

import {
  resolveLeadIntelligence,
  type FindingLike,
} from '../../src/utils/resolveLeadIntelligence';
import {
  actorRoleFromClassification,
  computeIntelligenceFinalScore,
  computeLeadFitScore,
  DEFAULT_TARGET_CLASSIFICATIONS,
  normalizeActorRole,
  normalizeClassification,
  type LeadClassification,
} from './leadIntelligence';
import { extractPhoneData } from './extractors/phoneExtractor';
import { extractMoneyData } from './extractors/moneyExtractor';
import { extractPropertyData } from './extractors/propertyExtractor';
import { extractContactData } from './extractors/contactExtractor';
import { extractLocation } from './extractors/locationExtractor';
import { detectSubjectDirection } from './subjectDirection';

export type StructuredFindingPatch = {
  personName: string | null;
  primaryPhone: string | null;
  needSummary: string | null;
  primaryLocation: string | null;
  primaryPropertyType: string | null;
  budgetMin: bigint | null;
  budgetMax: bigint | null;
  askingPrice: bigint | null;
  keywordScore: number | null;
  aiScore: number | null;
  leadFitScore: number | null;
  finalScore: number | null;
  scoreStatus: string;
  classification: string | null;
  intent: string | null;
  actorRole: string | null;
  extractedData: Record<string, unknown>;
};

function toBigInt(value: string | number | null | undefined): bigint | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.floor(n));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildStructuredFindingPatch(finding: FindingLike): StructuredFindingPatch {
  const contentText =
    finding.scannedContent?.contentText ||
    asRecord(finding.extractedData).originalContent ||
    finding.summary ||
    '';

  const phoneData = extractPhoneData(String(contentText));
  const moneyData = extractMoneyData(String(contentText));
  const moneyItems = moneyData.money;
  const propertyData = extractPropertyData(String(contentText));
  const contactData = extractContactData(String(contentText));
  const locationData = extractLocation(String(contentText));
  const direction = detectSubjectDirection(String(contentText));

  if (contactData.primaryContact?.associatedPhone) {
    phoneData.primaryPhone = contactData.primaryContact.associatedPhone;
    phoneData.phones = phoneData.phones.map(p =>
      p.normalized === contactData.primaryContact!.associatedPhone
        ? {
            ...p,
            label: p.label === 'other' ? 'zalo' : p.label,
            contactName: contactData.primaryContact!.displayName,
            confidence: Math.max(p.confidence, 0.97),
          }
        : p,
    );
  }

  const existingEd = asRecord(finding.extractedData);
  const moneyEd = asRecord(existingEd.money);
  const contactEd = asRecord(existingEd.contact);

  const buyer = moneyItems.find(m => m.type === 'buyer_budget');
  const rent = moneyItems.find(m => m.type === 'rent_price');
  const askingItem = moneyItems.find(m => m.type === 'asking_price');
  const asking =
    askingItem ||
    (moneyData.askingPrice
      ? {
          type: 'asking_price' as const,
          minAmountVnd: moneyData.askingPrice,
          maxAmountVnd: moneyData.askingPrice,
        }
      : null);

  const preferredClass =
    direction.classification !== 'unknown'
      ? direction.classification
      : propertyData.classification !== 'unknown'
        ? propertyData.classification
        : finding.classification || null;
  const preferredActor =
    direction.actorRole !== 'unknown'
      ? direction.actorRole
      : preferredClass
        ? actorRoleFromClassification(normalizeClassification(preferredClass))
        : finding.actorRole || null;

  const contactDisplay = contactData.primaryContact?.displayName || null;

  const enriched: FindingLike = {
    ...finding,
    needSummary: null,
    classification: preferredClass || finding.classification,
    intent: direction.intent !== 'unknown' ? direction.intent : finding.intent,
    actorRole: preferredActor || finding.actorRole,
    propertyType: finding.propertyType || propertyData.propertyTypes[0] || null,
    askingPrice: finding.askingPrice || moneyData.askingPrice,
    primaryPhone: phoneData.primaryPhone || finding.primaryPhone,
    personName: contactDisplay || finding.personName || finding.scannedContent?.authorName || null,
    primaryLocation: locationData.primaryLocation || finding.primaryLocation || null,
    extractedData: {
      ...existingEd,
      classification: preferredClass || existingEd.classification,
      intent: direction.intent !== 'unknown' ? direction.intent : existingEd.intent,
      actorRole: preferredActor || existingEd.actorRole,
      demand: {
        ...asRecord(existingEd.demand),
        needSummary: null,
      },
      intelligence: {
        ...asRecord(existingEd.intelligence),
        needSummary: null,
        summary: null,
      },
      leadAnalysis: {
        ...asRecord(existingEd.leadAnalysis),
        summary: null,
      },
      contact: {
        ...contactEd,
        phones: phoneData.phones.length ? phoneData.phones : contactEd.phones || [],
        primaryPhone: phoneData.primaryPhone,
        displayName: contactDisplay,
        contactName: contactData.primaryContact?.contactName || null,
      },
      money: {
        ...moneyEd,
        buyerBudgetMin: moneyEd.buyerBudgetMin ?? buyer?.minAmountVnd ?? null,
        buyerBudgetMax: moneyEd.buyerBudgetMax ?? buyer?.maxAmountVnd ?? null,
        rentBudgetMax: moneyEd.rentBudgetMax ?? rent?.maxAmountVnd ?? rent?.minAmountVnd ?? null,
        askingPrice: moneyData.askingPrice ?? asking?.minAmountVnd ?? null,
        askingPriceMin: moneyData.askingPrice ?? asking?.minAmountVnd ?? null,
        qualifier: askingItem?.qualifier ?? moneyEd.qualifier ?? null,
        display: askingItem?.display ?? moneyEd.display ?? null,
        mentions: moneyItems,
      },
      location: {
        ...asRecord(existingEd.location),
        city: locationData.city,
        district: locationData.district,
        ward: locationData.ward,
        street: locationData.street,
        primary: locationData.primaryLocation,
        normalizedLocations: locationData.normalizedLocations,
        rawMentions: locationData.rawMentions,
      },
      property: {
        ...asRecord(existingEd.property),
        propertyTypes:
          propertyData.propertyTypes.length > 0
            ? propertyData.propertyTypes
            : asRecord(existingEd.property).propertyTypes || existingEd.propertyTypes,
        areaMinM2: propertyData.area.areaMinM2,
        areaMaxM2: propertyData.area.areaMaxM2,
        frontageMeters: propertyData.area.frontageMeters,
        roadWidthMeters: propertyData.area.roadWidthMeters,
        pavementWidthMeters: propertyData.area.pavementWidthMeters,
        direction: propertyData.area.direction,
        features: propertyData.area.features,
      },
      area: propertyData.area,
      propertyTypes:
        propertyData.propertyTypes.length > 0
          ? propertyData.propertyTypes
          : existingEd.propertyTypes,
      person: {
        ...asRecord(existingEd.person),
        name: contactDisplay || finding.personName || finding.scannedContent?.authorName || null,
        displayName: contactDisplay,
        contactName: contactData.primaryContact?.contactName || null,
        facebookName: finding.scannedContent?.authorName || null,
        facebookProfileUrl: finding.scannedContent?.authorUrl || null,
      },
      source: {
        ...asRecord(existingEd.source),
        authorName: finding.scannedContent?.authorName || null,
        authorUrl: finding.scannedContent?.authorUrl || null,
        canonicalUrl: finding.scannedContent?.canonicalUrl || null,
      },
    },
  };

  const resolved = resolveLeadIntelligence(enriched);

  const classification = resolved.classification
    ? normalizeClassification(resolved.classification)
    : null;
  const actorRole = resolved.actorRole
    ? normalizeActorRole(resolved.actorRole)
    : null;

  const keywordScore = resolved.keywordScore ?? finding.keywordScore ?? 0;
  let aiScore = resolved.aiScore;
  let leadFitScore = resolved.leadFitScore;
  let finalScore = resolved.finalScore;
  let scoreStatus = resolved.scoreStatus;

  const isDemand =
    classification &&
    DEFAULT_TARGET_CLASSIFICATIONS.includes(classification as LeadClassification) &&
    actorRole === 'demand_side';

  if (isDemand) {
    leadFitScore = computeLeadFitScore({
      classification: classification as LeadClassification,
      actorRole: 'demand_side',
      targetClassifications: DEFAULT_TARGET_CLASSIFICATIONS,
      hasPhone: Boolean(resolved.primaryPhone),
      hasBudget: Boolean(resolved.budgetMin || resolved.budgetMax),
      hasLocation: Boolean(resolved.primaryLocation),
      hasPropertyType: resolved.propertyTypes.length > 0,
      urgency: resolved.urgency,
    });

    if (aiScore == null) {
      finalScore = computeIntelligenceFinalScore({
        leadFitScore,
        aiScore: null,
        keywordScore: keywordScore || 0,
        targetMatched: true,
      });
      scoreStatus = 'provisional';
    } else {
      finalScore = computeIntelligenceFinalScore({
        leadFitScore,
        aiScore,
        keywordScore: keywordScore || 0,
        targetMatched: true,
      });
      scoreStatus = 'scored';
    }
  } else if (classification === 'unknown' || !classification) {
    // never promote legacy score
    finalScore = null;
    leadFitScore = leadFitScore && leadFitScore > 0 && !isDemand ? 0 : leadFitScore;
    scoreStatus = 'needs_review';
  } else {
    // supply / broker against buyer-first mission
    leadFitScore = 0;
    finalScore = null;
    scoreStatus = 'needs_review';
  }

  const structuredExtracted: Record<string, unknown> = {
    ...existingEd,
    ...asRecord(enriched.extractedData),
    classification,
    intent: resolved.intent,
    actorRole,
    person: resolved.person,
    contact: resolved.contact,
    demand: resolved.demand,
    property: resolved.property,
    location: resolved.location,
    requirements: resolved.requirements,
    source: resolved.source,
    content: resolved.content,
    intelligence: {
      ...resolved.intelligence,
      needSummary: resolved.demand.needSummary,
    },
    keywordScore,
    aiScore,
    leadFitScore,
    finalScore,
    provisionalScore: scoreStatus === 'provisional' ? finalScore : null,
    scoreStatus,
    scoreBreakdown: {
      keywordScore,
      aiScore,
      leadFitScore,
      finalScore,
      provisionalScore: scoreStatus === 'provisional' ? finalScore : null,
      formula: '0.55*leadFit + 0.35*ai + 0.10*keyword',
    },
  };

  return {
    personName:
      resolved.person.name === 'Chưa xác định' ? null : resolved.person.name,
    primaryPhone: resolved.primaryPhone,
    needSummary: resolved.demand.needSummary,
    primaryLocation: resolved.location.primary,
    primaryPropertyType: resolved.property.propertyTypes[0] || null,
    budgetMin: toBigInt(resolved.demand.buyerBudgetMin),
    budgetMax: toBigInt(resolved.demand.buyerBudgetMax),
    askingPrice: toBigInt(resolved.askingPrice),
    keywordScore: keywordScore ?? null,
    aiScore: aiScore ?? null,
    leadFitScore: leadFitScore ?? null,
    finalScore: finalScore ?? null,
    scoreStatus,
    classification,
    intent: resolved.intent,
    actorRole,
    extractedData: structuredExtracted,
  };
}

export function recalculateFindingScores(finding: FindingLike): {
  keywordScore: number | null;
  aiScore: number | null;
  leadFitScore: number | null;
  finalScore: number | null;
  scoreStatus: string;
} {
  const patch = buildStructuredFindingPatch(finding);
  return {
    keywordScore: patch.keywordScore,
    aiScore: patch.aiScore,
    leadFitScore: patch.leadFitScore,
    finalScore: patch.finalScore,
    scoreStatus: patch.scoreStatus,
  };
}
