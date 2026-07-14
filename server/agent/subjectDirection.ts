/**
 * Subject direction + rebuild action resolver for Lead Intelligence.
 * Separates demand vs supply signals and broker demand vs broker supply.
 */

import type { ActorRole, LeadClassification } from './leadIntelligence';
import { actorRoleFromClassification, normalizeClassification } from './leadIntelligence';

export type RepresentedDemand = 'buyer' | 'renter' | 'investor' | 'none' | 'unknown';
export type BrokerActivity =
  | 'demand_request'
  | 'supply_listing'
  | 'recruitment'
  | 'unknown';

export type RebuildAction =
  | 'update'
  | 'dismiss'
  | 'needs_review'
  | 'duplicate'
  | 'skip_existing_dismissed'
  | 'dismiss_out_of_domain';

export const STRONG_SUPPLY_PATTERNS: Array<[RegExp, string]> = [
  [/cần\s*bán/i, 'cần bán'],
  [/bán\s*nhà/i, 'bán nhà'],
  [/bán\s*đất/i, 'bán đất'],
  [/bán\s*căn/i, 'bán căn'],
  [/bán\s*lô/i, 'bán lô'],
  [/chính\s*chủ\s*bán/i, 'chính chủ bán'],
  [/chủ\s*gửi\s*bán/i, 'chủ gửi bán'],
  [/giá\s*bán/i, 'giá bán'],
  [/sở\s*hữu\s*ngay/i, 'sở hữu ngay'],
  [/siêu\s*phẩm/i, 'siêu phẩm'],
  [/căn\s*này/i, 'căn này'],
  [/lô\s*này/i, 'lô này'],
  [/nhà\s*này/i, 'nhà này'],
  [/cho\s*thuê/i, 'cho thuê'],
  [/phòng\s*cho\s*thuê/i, 'phòng cho thuê'],
  [/giá\s*chỉ/i, 'giá chỉ'],
  [/liên\s*hệ\s*xem\s*nhà/i, 'liên hệ xem nhà'],
  [/em\s*có\s*căn/i, 'em có căn'],
  [/em\s*có\s*lô/i, 'em có lô'],
  [/có\s*căn\s*.*ib/i, 'có căn ib'],
  [/ra\s*hàng/i, 'ra hàng'],
  // Listing-style without explicit "bán"
  [/đang\s*khai\s*thác/i, 'đang khai thác'],
  [/dòng\s*tiền\s*sẵn/i, 'dòng tiền sẵn'],
  [/nhỉnh\s*[\d.,]+\s*t[yỷ]/i, 'nhỉnh X tỷ'],
  [/dãy\s*trọ/i, 'dãy trọ'],
  [/\bdt\s*[\d.,]+\s*m/i, 'dt Xm²'],
  [/ngang\s*[\d.,]+\s*m/i, 'ngang Xm'],
  [/kiệt\s*ô\s*tô/i, 'kiệt ô tô'],
  [/có\s*lô\s*đất/i, 'có lô đất'],
  [/xem\s*đất/i, 'xem đất'],
  [/xem\s*nhà/i, 'xem nhà'],
  [/hotline/i, 'hotline'],
  [/diện\s*tích\s*[:\-]?\s*\d/i, 'diện tích'],
  [/hướng\s*(đông|tây|nam|bắc)/i, 'hướng'],
  [/đường\s*\d+m/i, 'đường Xm'],
  [/lề\s*\d+m/i, 'lề Xm'],
  [/giá\s*tốt/i, 'giá tốt'],
  [/cần\s*ra\s*nhanh/i, 'cần ra nhanh'],
  [/phòng\s*trọ/i, 'phòng trọ'],
  [/dãy\s*trọ/i, 'dãy trọ'],
  [/giá\s*[:：]?\s*\d+[\.,]?\d*\s*tr/i, 'giá Xtr'],
];

export const STRONG_DEMAND_PATTERNS: Array<[RegExp, string]> = [
  [/cần\s*mua/i, 'cần mua'],
  [/tìm\s*mua/i, 'tìm mua'],
  [/muốn\s*mua/i, 'muốn mua'],
  [/cần\s*tìm\s*nhà/i, 'cần tìm nhà'],
  [/cần\s*tìm\s*đất/i, 'cần tìm đất'],
  [/cần\s*tìm\s*lô/i, 'cần tìm lô'],
  [/cần\s*mua\s*lại/i, 'cần mua lại'],
  [/tài\s*chính[\s\S]{0,40}cần/i, 'tài chính … cần'],
  [/cầm[\s\S]{0,30}(tỷ|ty|triệu|t\d)[\s\S]{0,40}(cần|tìm|đi)/i, 'cầm … tỷ cần tìm'],
  [/cầm\s+trên\s+tay/i, 'cầm trên tay'],
  [/đi\s+gần\s+\d+\s*tháng/i, 'đi gần N tháng'],
  [/cần\s*thuê/i, 'cần thuê'],
  [/tìm\s*thuê/i, 'tìm thuê'],
  [/muốn\s*thuê/i, 'muốn thuê'],
  [/khách\s*cần\s*tìm/i, 'khách cần tìm'],
  [/khách\s*mua/i, 'khách mua'],
  [/khách\s*thuê/i, 'khách thuê'],
  [/khách\s*cần/i, 'khách cần'],
  [/tc\s*[:：]/i, 'tc:'],
  [/quay\s*đầu\s*cần/i, 'quay đầu cần'],
];

const BROKER_DEMAND_PATTERNS: Array<[RegExp, string]> = [
  [/khách\s*cần\s*tìm/i, 'khách cần tìm'],
  [/khách\s*mua/i, 'khách mua'],
  [/khách\s*thuê/i, 'khách thuê'],
  [/khách\s*cần/i, 'khách cần'],
  [/đang\s*tìm\s*giùm\s*khách/i, 'tìm giùm khách'],
  [/nhờ\s*anh\s*em.*khách/i, 'nhờ anh em khách'],
];

const BROKER_SUPPLY_PATTERNS: Array<[RegExp, string]> = [
  [/em\s*có\s*căn/i, 'em có căn'],
  [/em\s*có\s*lô/i, 'em có lô'],
  [/có\s*căn.*giá\s*tốt/i, 'có căn giá tốt'],
  [/ib\s*(em|ngay)/i, 'ib'],
  [/liên\s*hệ\s*em/i, 'liên hệ em'],
  [/inbox\s*em/i, 'inbox em'],
];

const RECRUITMENT_PATTERNS: Array<[RegExp, string]> = [
  [/tuyển\s*sale/i, 'tuyển sale'],
  [/tuyển\s*dụng/i, 'tuyển dụng'],
  [/tuyển\s*ctv/i, 'tuyển ctv'],
  [/tuyển\s*môi\s*giới/i, 'tuyển môi giới'],
  [/cộng\s*tác\s*viên/i, 'cộng tác viên'],
];

export interface SubjectDirectionResult {
  classification: LeadClassification;
  actorRole: ActorRole;
  intent: string;
  representedDemand: RepresentedDemand;
  brokerActivity: BrokerActivity;
  demandSignals: string[];
  supplySignals: string[];
  confidence: number;
}

function matchSignals(text: string, patterns: Array<[RegExp, string]>): string[] {
  const hits: string[] = [];
  for (const [re, label] of patterns) {
    if (re.test(text) && !hits.includes(label)) hits.push(label);
  }
  return hits;
}

export function detectSubjectDirection(rawText: string): SubjectDirectionResult {
  const text = String(rawText || '').toLowerCase();
  const demandSignals = matchSignals(text, STRONG_DEMAND_PATTERNS);
  const supplySignals = matchSignals(text, STRONG_SUPPLY_PATTERNS);
  const brokerDemandHits = matchSignals(text, BROKER_DEMAND_PATTERNS);
  const brokerSupplyHits = matchSignals(text, BROKER_SUPPLY_PATTERNS);
  const recruitmentHits = matchSignals(text, RECRUITMENT_PATTERNS);

  const hasDemand = demandSignals.length > 0;
  const hasSupply = supplySignals.length > 0;
  const isLeaseSupply =
    /cho\s*thuê|phòng\s*cho\s*thuê/i.test(text) && !/cần\s*thuê|tìm\s*thuê|muốn\s*thuê/i.test(text);
  const isRentDemand =
    /cần\s*thuê|tìm\s*thuê|muốn\s*thuê/i.test(text) && !/cho\s*thuê/i.test(text);

  let classification: LeadClassification = 'unknown';
  let intent = 'unknown';
  let representedDemand: RepresentedDemand = 'none';
  let brokerActivity: BrokerActivity = 'unknown';
  let confidence = 0.4;

  // Recruitment
  if (recruitmentHits.length) {
    return {
      classification: 'broker',
      actorRole: 'broker',
      intent: 'service',
      representedDemand: 'none',
      brokerActivity: 'recruitment',
      demandSignals,
      supplySignals: [...supplySignals, ...recruitmentHits],
      confidence: 0.85,
    };
  }

  // Broker representing customer demand (“Khách cần tìm…”)
  if (brokerDemandHits.length || (/khách\s*cần/i.test(text) && hasDemand)) {
    const demandType: RepresentedDemand = isRentDemand
      ? 'renter'
      : /đầu\s*tư|cashflow|dòng\s*tiền/i.test(text)
        ? 'investor'
        : 'buyer';
    return {
      classification: 'broker',
      actorRole: 'broker',
      intent: demandType === 'renter' ? 'rent' : demandType === 'investor' ? 'invest' : 'buy',
      representedDemand: demandType,
      brokerActivity: 'demand_request',
      demandSignals: [...new Set([...demandSignals, ...brokerDemandHits])],
      supplySignals,
      confidence: 0.8,
    };
  }

  // Broker supply listing
  if (brokerSupplyHits.length && !hasDemand) {
    return {
      classification: 'broker',
      actorRole: 'broker',
      intent: 'service',
      representedDemand: 'none',
      brokerActivity: 'supply_listing',
      demandSignals,
      supplySignals: [...new Set([...supplySignals, ...brokerSupplyHits])],
      confidence: 0.85,
    };
  }

  // Strong demand — never classify seller just because nhà/đất/giá appear
  if (hasDemand && !isLeaseSupply) {
    if (isRentDemand) {
      classification = 'renter';
      intent = 'rent';
      representedDemand = 'renter';
    } else if (/đầu\s*tư|cashflow|dòng\s*tiền/i.test(text) && /(cần|tìm|muốn)/i.test(text) && !/dòng\s*tiền\s*sẵn|đang\s*khai\s*thác/i.test(text)) {
      classification = 'investor';
      intent = 'invest';
      representedDemand = 'investor';
    } else {
      classification = 'buyer';
      intent = 'buy';
      representedDemand = 'buyer';
    }
    confidence = demandSignals.length >= 2 ? 0.85 : 0.7;
    return {
      classification,
      actorRole: 'demand_side',
      intent,
      representedDemand,
      brokerActivity: 'unknown',
      demandSignals,
      supplySignals,
      confidence,
    };
  }

  // Strong supply without demand
  if (hasSupply && !hasDemand) {
    // Asset type "dãy/phòng trọ" alone is NOT landlord — many sale listings
    // describe a cashflowing boarding house with asking price (nhỉnh X tỷ).
    const hasSaleAsking =
      /nhỉnh\s*[\d.,]+\s*t[yỷ]/i.test(text) ||
      /giá\s*bán/i.test(text) ||
      (/giá\s*[:：]?\s*[\d.,]+\s*t[yỷ]/i.test(text) && !/\/\s*tháng|tháng/i.test(text));
    const leaseOutOnly =
      isLeaseSupply ||
      (/giá\s*thuê/i.test(text) && !hasSaleAsking) ||
      ((/phòng\s*trọ|dãy\s*trọ/i.test(text) || /đang\s*khai\s*thác|dòng\s*tiền\s*sẵn/i.test(text)) &&
        /cho\s*thuê/i.test(text) &&
        !hasSaleAsking);

    if (leaseOutOnly && !hasSaleAsking) {
      classification = 'landlord';
      intent = 'lease_out';
    } else {
      classification = 'seller';
      intent = 'sell';
    }
    return {
      classification,
      actorRole: 'supply_side',
      intent,
      representedDemand: 'none',
      brokerActivity: brokerSupplyHits.length ? 'supply_listing' : 'unknown',
      demandSignals,
      supplySignals,
      confidence: supplySignals.length >= 2 ? 0.85 : 0.7,
    };
  }

  // Ambiguous: both demand and supply, or neither
  if (hasDemand && hasSupply) {
    return {
      classification: 'unknown',
      actorRole: 'unknown',
      intent: 'unknown',
      representedDemand: 'unknown',
      brokerActivity: 'unknown',
      demandSignals,
      supplySignals,
      confidence: 0.35,
    };
  }

  return {
    classification: 'unknown',
    actorRole: 'unknown',
    intent: 'unknown',
    representedDemand: 'unknown',
    brokerActivity: 'unknown',
    demandSignals,
    supplySignals,
    confidence: 0.3,
  };
}

export interface ResolveRebuildActionInput {
  classification: LeadClassification;
  actorRole: ActorRole;
  representedDemand: RepresentedDemand;
  brokerActivity: BrokerActivity;
  finalScore: number;
  minFindingScore: number;
  dedupeStatus: string;
  duplicateConfidence?: number | null;
  existingStatus?: string | null;
  spamCertain?: boolean;
  domainDecision?: 'accept' | 'reject' | 'needs_review' | null;
  domainReasonCode?: string | null;
}

export interface ResolveRebuildActionResult {
  action: RebuildAction;
  reviewReason: string | null;
}

export function resolveRebuildAction(input: ResolveRebuildActionInput): ResolveRebuildActionResult {
  if (input.existingStatus === 'dismissed') {
    return { action: 'skip_existing_dismissed', reviewReason: null };
  }

  if (input.domainDecision === 'reject') {
    return {
      action: 'dismiss_out_of_domain',
      reviewReason: input.domainReasonCode || 'out_of_domain',
    };
  }

  if (input.domainDecision === 'needs_review') {
    return {
      action: 'needs_review',
      reviewReason: input.domainReasonCode || 'domain_unknown',
    };
  }

  if (
    input.dedupeStatus === 'duplicate' &&
    (input.duplicateConfidence == null || input.duplicateConfidence >= 0.9)
  ) {
    return { action: 'duplicate', reviewReason: 'duplicate_confident' };
  }

  if (input.spamCertain || input.classification === 'spam') {
    return { action: 'dismiss', reviewReason: null };
  }

  // Broker demand — never auto-dismiss
  if (
    input.classification === 'broker' &&
    (input.brokerActivity === 'demand_request' ||
      input.representedDemand === 'buyer' ||
      input.representedDemand === 'renter' ||
      input.representedDemand === 'investor')
  ) {
    return {
      action: 'needs_review',
      reviewReason: 'broker_demand_request',
    };
  }

  // Broker supply / recruitment — dismiss
  if (
    input.classification === 'broker' &&
    (input.brokerActivity === 'supply_listing' || input.brokerActivity === 'recruitment')
  ) {
    return { action: 'dismiss', reviewReason: null };
  }

  if (input.classification === 'broker') {
    return { action: 'needs_review', reviewReason: 'broker_activity_unclear' };
  }

  // Unknown — never auto-dismiss
  if (input.classification === 'unknown') {
    return { action: 'needs_review', reviewReason: 'unknown_classification' };
  }

  if (input.actorRole === 'unknown') {
    return { action: 'needs_review', reviewReason: 'unknown_actor_role' };
  }

  const demandClasses: LeadClassification[] = ['buyer', 'renter', 'investor'];
  if (demandClasses.includes(input.classification) && input.actorRole === 'demand_side') {
    if (input.finalScore >= input.minFindingScore) {
      return { action: 'update', reviewReason: null };
    }
    return {
      action: 'needs_review',
      reviewReason: `finalScore ${input.finalScore} < minFindingScore ${input.minFindingScore}`,
    };
  }

  if (
    (input.classification === 'seller' || input.classification === 'landlord') &&
    input.actorRole === 'supply_side'
  ) {
    return { action: 'dismiss', reviewReason: null };
  }

  // discussion / service / other non-target
  return { action: 'needs_review', reviewReason: `out_of_target:${input.classification}` };
}

/** Merge subject direction over a prior classification guess. */
export function applySubjectDirectionOverride(
  prior: LeadClassification,
  direction: SubjectDirectionResult,
): SubjectDirectionResult {
  // Prefer strong deterministic direction over weak prior unknown/mismatches
  if (direction.classification !== 'unknown') return direction;
  if (prior !== 'unknown') {
    return {
      ...direction,
      classification: normalizeClassification(prior),
      actorRole: actorRoleFromClassification(normalizeClassification(prior)),
    };
  }
  return direction;
}
