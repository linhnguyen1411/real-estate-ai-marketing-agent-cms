/**
 * Single Lead Intelligence resolver — cards, drawers, promote, matching, inventory.
 * Precedence: Prisma columns → extractedData structured → extractedData legacy → ScannedContent → null.
 * Never maps finding.score → finalScore.
 *
 * Pure: plain objects only — no PrismaClient, React, Express, Playwright.
 */

export type { AnalysisStatus, ScoreStatus } from './leadIntelligenceScore';
import type { AnalysisStatus, ScoreStatus } from './leadIntelligenceScore';

export type PersonType = 'individual' | 'page' | 'agency' | 'unknown';

export type FindingLike = {
  id?: string;
  scannedContentId?: string;
  title?: string | null;
  summary?: string | null;
  score?: number | null;
  classification?: string | null;
  intent?: string | null;
  actorRole?: string | null;
  priority?: string | null;
  confidence?: number | null;
  keywordScore?: number | null;
  aiScore?: number | null;
  leadFitScore?: number | null;
  finalScore?: number | null;
  scoreStatus?: string | null;
  primaryPhone?: string | null;
  primaryLocation?: string | null;
  budgetMin?: string | number | bigint | null;
  budgetMax?: string | number | bigint | null;
  askingPrice?: string | number | bigint | null;
  propertyType?: string | null;
  personName?: string | null;
  needSummary?: string | null;
  status?: string | null;
  promotedLeadId?: string | null;
  promotedAt?: string | Date | null;
  externalInventoryItemId?: string | null;
  externalInventorySavedAt?: string | Date | null;
  reviewedAt?: string | Date | null;
  extractedData?: unknown;
  reasons?: unknown;
  scannedContent?: {
    authorName?: string | null;
    authorUrl?: string | null;
    canonicalUrl?: string | null;
    contentText?: string | null;
    publishedAt?: string | Date | null;
    collectedAt?: string | Date | null;
  } | null;
  source?: { id?: string; name?: string | null; type?: string | null } | null;
};

export type ResolvedLeadIntelligence = {
  findingId: string | null;
  scannedContentId: string | null;
  classification: string | null;
  intent: string | null;
  actorRole: string | null;
  priority: string | null;
  urgency: string | null;
  confidence: number | null;
  keywordScore: number | null;
  aiScore: number | null;
  leadFitScore: number | null;
  finalScore: number | null;
  provisionalScore: number | null;
  analysisStatus: AnalysisStatus;
  scoreStatus: ScoreStatus;

  person: {
    name: string;
    facebookName: string | null;
    facebookProfileUrl: string | null;
    type: PersonType;
  };
  contact: {
    phones: Array<{
      raw: string;
      normalized: string;
      e164?: string;
      label?: string;
      contactName?: string;
      source: string;
      confidence: number;
    }>;
    primaryPhone: string | null;
    primaryPhoneDetail: {
      raw: string;
      normalized: string;
      e164?: string;
      label?: string;
      contactName?: string;
      source: string;
      confidence: number;
    } | null;
    secondaryPhones: string[];
    emails: string[];
    zalo: string | null;
    contactConfidence: number | null;
    displayName: string | null;
  };
  demand: {
    needSummary: string;
    buyerBudgetMin: string | number | null;
    buyerBudgetMax: string | number | null;
    rentBudgetMin: string | number | null;
    rentBudgetMax: string | number | null;
    investmentBudgetMin: string | number | null;
    investmentBudgetMax: string | number | null;
    purpose: string | null;
    transactionTimeline: string | null;
  };
  property: {
    propertyTypes: string[];
    areaMinM2: number | null;
    areaMaxM2: number | null;
    frontageMeters: number | null;
    depthMeters: number | null;
    roadWidthMeters: number | null;
    pavementWidthMeters: number | null;
    bedrooms: number | null;
    floors: number | null;
    legalStatus: string | null;
    direction: string | null;
    features: Record<string, boolean>;
  };
  location: {
    city: string | null;
    district: string | null;
    ward: string | null;
    street: string | null;
    project: string | null;
    normalizedLocations: string[];
    primary: string | null;
  };
  requirements: {
    carAccess: boolean | null;
    mainRoad: boolean | null;
    nearCenter: boolean | null;
    nearSea: boolean | null;
    cashflow: boolean | null;
    businessUse: boolean | null;
    investmentPurpose: boolean | null;
    otherRequirements: string[];
  };
  source: {
    sourceName: string | null;
    sourceType: string | null;
    groupName: string | null;
    authorName: string | null;
    authorUrl: string | null;
    canonicalUrl: string | null;
    publishedAt: string | null;
    collectedAt: string | null;
  };
  content: {
    title: string;
    shortDescription: string;
    fullOriginalContent: string | null;
  };
  intelligence: {
    summary: string;
    reasons: string[];
    recommendedAction: string | null;
    replySuggestion: string | null;
    missingInformation: string[];
    risks: string[];
  };

  /** Flat aliases for existing UI */
  title: string;
  summary: string;
  recommendedAction: string | null;
  phones: string[];
  primaryPhone: string | null;
  budgetMin: string | number | null;
  budgetMax: string | number | null;
  askingPrice: string | number | null;
  /** Flat primary location string for legacy UI */
  primaryLocation: string | null;
  propertyTypes: string[];
  requirementsList: string[];
  consistencyWarnings: string[];
  dataInconsistent: boolean;
  displayScoreLabel: string;
  displayClassificationLabel: string;
  displayBudgetLabel: string;
  displayPersonName: string;
  priceQualifier: string | null;
  showAsConfirmedLead: boolean;
  isDemandSide: boolean;
  isSupplySide: boolean;
  matchingEnabled: boolean;
  promoteAvailable: boolean;
  externalInventoryPreferred: boolean;
};

/** Canonical domain alias — same shape as historical ResolvedLeadIntelligence */
export type LeadIntelligence = ResolvedLeadIntelligence;

const DEMAND = new Set(['buyer', 'renter', 'investor']);
const SUPPLY = new Set(['seller', 'landlord']);

const CLASS_LABELS: Record<string, string> = {
  buyer: 'Người mua',
  renter: 'Người thuê',
  investor: 'Nhà đầu tư',
  seller: 'Người bán',
  landlord: 'Cho thuê',
  broker: 'Môi giới',
  service: 'Dịch vụ',
  discussion: 'Thảo luận',
  spam: 'Spam',
  unknown: 'Chưa xác định',
};

const PAGE_AGENCY_RE =
  /\b(page|fanpage|agency|công\s*ty|cong\s*ty|bđs|bds|real\s*estate|môi\s*giới|moi\s*gioi|broker|nhà\s*đất|nha\s*dat)\b/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstDefined<T>(...vals: Array<T | null | undefined>): T | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return v;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => String(v).trim()).filter(Boolean);
}

function asBool(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  return null;
}

function moneyField(value: unknown): string | number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value).trim();
  return s || null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  return s || null;
}

function detectPersonType(name: string | null): PersonType {
  if (!name || name === 'Chưa xác định') return 'unknown';
  if (PAGE_AGENCY_RE.test(name)) {
    if (/page|fanpage/i.test(name)) return 'page';
    if (/agency|công\s*ty|cong\s*ty/i.test(name)) return 'agency';
    return 'agency';
  }
  return 'individual';
}

/** Clean summary: strip technical prefixes, decorative emoji edges, collapse space. */
export function cleanLeadSummary(raw: string | null | undefined, title?: string | null): string {
  let text = String(raw || '').trim();
  if (!text) return '';

  text = text.replace(
    /^tín\s*hiệu\s*phía\s*(cầu|cung)(?:\s*\([^)]*\))?\s*[.：:\-–—]?\s*/i,
    '',
  );
  text = text.replace(
    /^tín\s*hiệu\s*phía\s*cung\/khác(?:\s*\([^)]*\))?\s*[.：:\-–—]?\s*/i,
    '',
  );
  text = text.replace(
    /^môi\s*giới\s*đại\s*diện\s*nhu\s*cầu(?:\s*\([^)]*\))?\s*[.：:\-–—]?\s*/i,
    '',
  );
  text = text.replace(/\b(matched\s*keyword|buyer\s*signal|kw\s*score|keyword\s*score)\b/gi, '');

  text = text.replace(
    /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s🔥🍀🏠📍📐💰☎️📲‼️✅️☘️😘💥🌿✨🌹🍀]+/gu,
    '',
  );
  text = text.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s🔥🍀🏠📍📐💰☎️📲‼️✅️☘️😘💥🌿✨🌹🍀]+$/gu,
    '',
  );

  text = text.replace(/\s+/g, ' ').trim();

  const titleNorm = String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (titleNorm && text.toLowerCase().startsWith(titleNorm)) {
    text = text.slice(titleNorm.length).replace(/^[\s.：:\-–—]+/, '').trim();
  }

  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length > 2) text = sentences.slice(0, 2).join(' ');

  return text;
}

export function formatVietnamPhoneDisplay(raw: string | null | undefined | object): string {
  if (raw == null) return '';
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return formatVietnamPhoneDisplay(
      (o.normalized as string) || (o.raw as string) || (o.phone as string) || null,
    );
  }
  const digits = String(raw).replace(/\D/g, '');
  if (!digits || /object\s*object/i.test(String(raw))) return '';
  let local = digits;
  if (local.startsWith('84') && local.length >= 11) local = `0${local.slice(2)}`;
  if (local.length === 10 && local.startsWith('0')) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  if (local.length === 11 && local.startsWith('0')) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return String(raw).trim();
}

function coercePhoneString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value).trim();
    if (!s || /\[object object\]/i.test(s)) return null;
    return s;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return coercePhoneString(o.normalized ?? o.raw ?? o.phone ?? o.value ?? null);
  }
  return null;
}

export function formatResolvedBudget(
  min: string | number | null,
  max: string | number | null,
  opts?: { period?: 'month' | null; prefix?: string },
): string {
  const fmt = (value: string | number | null): string | null => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    if (num >= 1_000_000_000) {
      const ty = num / 1_000_000_000;
      return `${ty % 1 === 0 ? ty.toFixed(0) : ty.toFixed(2)} tỷ`;
    }
    if (num >= 1_000_000) {
      const tr = num / 1_000_000;
      return `${tr % 1 === 0 ? tr.toFixed(0) : tr.toFixed(1)} triệu`;
    }
    return num.toLocaleString('vi-VN');
  };
  const a = fmt(min);
  const b = fmt(max);
  const suffix = opts?.period === 'month' ? '/tháng' : '';
  let body = '';
  if (!a && !b) return 'Chưa xác định';
  if (a && b && a === b) body = a;
  else if (a && b) body = `${a} – ${b}`;
  else if (a) body = `Từ ${a}`;
  else body = `≤ ${b}`;
  return `${body}${suffix}`;
}

function titleImpliesDemand(title: string): boolean {
  const t = title.toLowerCase();
  return /khách\s*tìm\s*(mua|thuê)|người\s*mua|người\s*thuê|nhà\s*đầu\s*tư|đang\s*tìm\s*mua/.test(
    t,
  );
}

function formatMetersVi(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return String(n).replace('.', ',');
}

function propertyTypeLabel(types: string[]): string | null {
  if (!types.length) return null;
  const first = types.find(t => t !== 'land') || types[0];
  if (first === 'land' || /đất|lô/.test(first)) return 'lô đất';
  return first;
}

function buildDeterministicNeedSummary(input: {
  classification: string | null;
  location: string | null;
  propertyTypes: string[];
  budgetLabel: string;
  purpose: string | null;
  rawContent: string | null;
  areaMinM2?: number | null;
  areaMaxM2?: number | null;
  roadWidthMeters?: number | null;
  pavementWidthMeters?: number | null;
  direction?: string | null;
}): string {
  const isSupply =
    input.classification === 'seller' ||
    input.classification === 'landlord' ||
    input.classification === 'broker';

  if (isSupply) {
    const typeLabel = propertyTypeLabel(input.propertyTypes) || 'BĐS';
    const area =
      input.areaMinM2 != null
        ? `${input.areaMinM2} m²`
        : input.areaMaxM2 != null
          ? `${input.areaMaxM2} m²`
          : null;
    const parts: string[] = [];
    if (input.classification === 'landlord') {
      parts.push(`Cho thuê ${typeLabel}`);
    } else if (input.classification === 'broker') {
      parts.push(`Tin môi giới ${typeLabel}`);
    } else {
      parts.push(`Chào bán ${typeLabel}`);
    }
    if (area) parts[0] += ` ${area}`;
    if (input.location) parts.push(`tại ${input.location}`);
    const road = formatMetersVi(input.roadWidthMeters);
    const pavement = formatMetersVi(input.pavementWidthMeters);
    if (road) parts.push(`đường ${road} m`);
    if (pavement) parts.push(`lề ${pavement} m`);
    if (input.direction) parts.push(`hướng ${input.direction}`);
    if (input.budgetLabel !== 'Chưa xác định') {
      parts.push(`giá ${input.budgetLabel.toLowerCase().startsWith('trên') || input.budgetLabel.toLowerCase().startsWith('khoảng') ? input.budgetLabel.toLowerCase() : input.budgetLabel}`);
    }
    return parts.join(', ').replace(/^([^,]+),\s*/, '$1 ') || 'Nguồn hàng chưa đủ thông tin';
  }

  const role =
    input.classification === 'renter'
      ? 'Khách cần thuê'
      : input.classification === 'investor'
        ? 'Nhà đầu tư tìm'
        : 'Khách cần mua';

  const parts: string[] = [role];
  if (input.propertyTypes[0] && input.propertyTypes[0] !== 'land') {
    parts.push(input.propertyTypes[0]);
  } else if (input.propertyTypes.includes('land')) {
    parts.push('đất');
  }
  if (input.location) parts.push(`tại ${input.location}`);
  if (input.budgetLabel !== 'Chưa xác định') {
    parts.push(
      input.classification === 'renter'
        ? `giá thuê ${input.budgetLabel}`
        : `ngân sách ${input.budgetLabel}`,
    );
  }
  if (input.purpose) parts.push(`mục đích ${input.purpose}`);

  let text = parts.join(' ');
  if (text.length < 20 && input.rawContent) {
    const snippet = cleanLeadSummary(input.rawContent.slice(0, 220));
    if (snippet) text = snippet;
  }
  return text || 'Chưa đủ thông tin nhu cầu';
}

function buildSupplyShortDescription(input: {
  propertyTypes: string[];
  features: Record<string, boolean>;
  contactDisplay: string | null;
  primaryPhone: string | null;
  phoneCount: number;
}): string | null {
  const typeLabel = propertyTypeLabel(input.propertyTypes);
  if (!typeLabel) return null;
  const feats: string[] = [];
  if (input.features.newResidentialArea) feats.push('khu dân cư mới');
  const near: string[] = [];
  if (input.features.nearMountain) near.push('núi');
  if (input.features.nearRiver) near.push('sông');
  if (input.features.nearSea) near.push('biển');
  let text = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
  if (feats.length) text += ` ${feats.join(', ')}`;
  if (near.length) text += `, gần ${near.join(', ')}`;
  if (input.phoneCount >= 2 && input.primaryPhone) {
    const phoneDisp = formatVietnamPhoneDisplay(input.primaryPhone) || input.primaryPhone;
    text += `; có hai số liên hệ, trong đó Zalo${input.contactDisplay ? ` ${input.contactDisplay}` : ''} là ${phoneDisp}`;
  } else if (input.primaryPhone && input.contactDisplay) {
    text += `; liên hệ ${input.contactDisplay}`;
  }
  return text.endsWith('.') ? text : `${text}.`;
}

function resolveScoreStatus(input: {
  stored: string | null;
  classification: string | null;
  actorRole: string | null;
  finalScore: number | null;
  provisionalScore: number | null;
  aiScore: number | null;
  analysisStatus: AnalysisStatus;
  dataInconsistent: boolean;
}): ScoreStatus {
  if (input.stored === 'scored' || input.stored === 'provisional' || input.stored === 'needs_review' || input.stored === 'failed') {
    return input.stored;
  }
  if (input.analysisStatus === 'failed' || input.dataInconsistent) return 'failed';
  const isDemand =
    Boolean(input.classification) &&
    DEMAND.has(input.classification!) &&
    input.actorRole === 'demand_side';
  if (!isDemand) return 'needs_review';
  if (input.finalScore != null && input.aiScore != null) return 'scored';
  if (input.provisionalScore != null || (input.finalScore != null && input.aiScore == null)) {
    return 'provisional';
  }
  return 'needs_review';
}

export function resolveLeadIntelligence(finding: FindingLike): ResolvedLeadIntelligence {
  const ed = asRecord(finding.extractedData);
  const intelligence = asRecord(ed.intelligence);
  const analysis = asRecord(ed.analysis);
  const leadAnalysis = asRecord(ed.leadAnalysis);
  const money = asRecord(ed.money);
  const contact = asRecord(ed.contact);
  const locationObj = asRecord(ed.location);
  const property = asRecord(ed.property);
  const requirementsObj = asRecord(ed.requirements);
  const scoreBreakdown = asRecord(ed.scoreBreakdown);
  const personEd = asRecord(ed.person);
  const sourceEd = asRecord(ed.source);
  const demandEd = asRecord(ed.demand);
  const contentEd = asRecord(ed.content);
  const sc = finding.scannedContent || null;

  const classification = firstDefined(
    asString(finding.classification),
    asString(ed.classification),
    asString(intelligence.classification),
    asString(leadAnalysis.classification),
  );

  const intent = firstDefined(
    asString(finding.intent),
    asString(ed.intent),
    asString(intelligence.intent),
    asString(leadAnalysis.intent),
  );

  const actorRole = firstDefined(
    asString(finding.actorRole),
    asString(ed.actorRole),
    asString(intelligence.actorRole),
    asString(leadAnalysis.actorRole),
  );

  const urgency = firstDefined(
    asString(ed.urgency),
    asString(intelligence.urgency),
    asString(leadAnalysis.urgency),
    asString(demandEd.urgency),
  );

  const priority = firstDefined(asString(finding.priority), asString(intelligence.priority));

  const confidence = firstDefined(
    asNumber(finding.confidence),
    asNumber(ed.confidence),
    asNumber(leadAnalysis.confidence),
  );

  const keywordScore = firstDefined(
    asNumber(finding.keywordScore),
    asNumber(ed.keywordScore),
    asNumber(scoreBreakdown.keywordScore),
  );

  const aiScore = firstDefined(
    asNumber(finding.aiScore),
    asNumber(ed.aiScore),
    asNumber(scoreBreakdown.aiScore),
    asNumber(leadAnalysis.score),
  );

  // CRITICAL: never use finding.score as finalScore
  const finalScore = firstDefined(
    asNumber(finding.finalScore),
    asNumber(ed.finalScore),
    finding.classification || finding.leadFitScore != null
      ? asNumber(scoreBreakdown.finalScore)
      : null,
  );

  const leadFitScore = firstDefined(
    asNumber(finding.leadFitScore),
    asNumber(ed.leadFitScore),
  );

  const provisionalScore = firstDefined(
    asNumber(ed.provisionalScore),
    asNumber(scoreBreakdown.provisionalScore),
    aiScore == null && leadFitScore != null && classification && DEMAND.has(classification)
      ? finalScore ?? leadFitScore
      : null,
  );

  // Person — contact name from body > authorName > never group/title
  const contactDisplayName = firstDefined(
    asString(personEd.displayName),
    asString(contact.displayName),
    asString(asRecord(ed.contactName).displayName),
    asString(ed.contactDisplayName),
  );
  const contactPersonName = firstDefined(
    asString(personEd.contactName),
    asString(contact.contactName),
    asString(ed.contactName) && !String(ed.contactName).includes('[object')
      ? asString(ed.contactName)
      : null,
  );
  const facebookName = firstDefined(
    asString(sc?.authorName),
    asString(sourceEd.authorName),
    asString(personEd.facebookName),
  );
  const facebookProfileUrl = firstDefined(
    asString(sc?.authorUrl),
    asString(sourceEd.authorUrl),
    asString(personEd.facebookProfileUrl),
  );
  const personNameRaw = firstDefined(
    contactDisplayName,
    contactPersonName,
    asString(finding.personName),
    asString(personEd.name),
    facebookName,
  );
  const personName = personNameRaw || 'Chưa xác định';
  const personType = firstDefined(
    asString(personEd.type) as PersonType | null,
    detectPersonType(personNameRaw),
  ) as PersonType;

  // Phones — never stringify objects to "[object Object]"
  type PhoneDetail = {
    raw: string;
    normalized: string;
    e164?: string;
    label?: string;
    contactName?: string;
    source: string;
    confidence: number;
  };
  const phoneDetails: PhoneDetail[] = [];
  const pushPhoneDetail = (v: unknown) => {
    if (v == null) return;
    if (typeof v === 'string' || typeof v === 'number') {
      const s = coercePhoneString(v);
      if (!s) return;
      if (phoneDetails.some(p => p.normalized === s || p.raw === s)) return;
      phoneDetails.push({
        raw: s,
        normalized: s.replace(/\D/g, '').replace(/^84/, '0') || s,
        source: 'legacy',
        confidence: 0.5,
      });
      return;
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const normalized = coercePhoneString(o.normalized ?? o.raw ?? o.phone ?? o.value);
      if (!normalized) return;
      if (phoneDetails.some(p => p.normalized === normalized)) return;
      phoneDetails.push({
        raw: coercePhoneString(o.raw) || normalized,
        normalized,
        e164: asString(o.e164) || undefined,
        label: asString(o.label) || undefined,
        contactName: asString(o.contactName) || undefined,
        source: asString(o.source) || 'post_body',
        confidence: asNumber(o.confidence) ?? 0.7,
      });
    }
  };
  if (Array.isArray(contact.phones)) contact.phones.forEach(pushPhoneDetail);
  pushPhoneDetail(contact.primaryPhone);
  pushPhoneDetail(finding.primaryPhone);
  pushPhoneDetail(leadAnalysis.contact && asRecord(leadAnalysis.contact).phone);

  const phoneStrings = phoneDetails.map(p => p.normalized).filter(Boolean);
  const namedPhone =
    phoneDetails.find(p => p.contactName)?.normalized || null;
  const zaloPhone = phoneDetails.find(p => p.label === 'zalo')?.normalized || null;
  const hotlinePhone = phoneDetails.find(p => p.label === 'hotline')?.normalized || null;
  const primaryFromCol = coercePhoneString(finding.primaryPhone);
  const primaryFromContact = coercePhoneString(contact.primaryPhone);
  // Prefer contact-name / Zalo over legacy column (often first/hotline).
  const primaryPhone =
    namedPhone ||
    zaloPhone ||
    hotlinePhone ||
    firstDefined(primaryFromCol, primaryFromContact, phoneStrings[0] ?? null);
  const primaryPhoneDetail =
    phoneDetails.find(p => p.normalized === primaryPhone) ||
    (primaryPhone
      ? { raw: primaryPhone, normalized: primaryPhone, source: 'resolved', confidence: 0.7 }
      : null);
  const secondaryPhones = phoneStrings.filter(p => p !== primaryPhone);

  const buyerBudgetMin = firstDefined(
    moneyField(finding.budgetMin),
    moneyField(demandEd.buyerBudgetMin),
    moneyField(money.buyerBudgetMin),
    moneyField(money.budgetMin),
    moneyField(leadAnalysis.budgetMin),
  );
  const buyerBudgetMax = firstDefined(
    moneyField(finding.budgetMax),
    moneyField(demandEd.buyerBudgetMax),
    moneyField(money.buyerBudgetMax),
    moneyField(money.budgetMax),
    moneyField(leadAnalysis.budgetMax),
  );
  const rentBudgetMin = firstDefined(
    moneyField(demandEd.rentBudgetMin),
    moneyField(money.rentBudgetMin),
  );
  const rentBudgetMax = firstDefined(
    moneyField(demandEd.rentBudgetMax),
    moneyField(money.rentBudgetMax),
    moneyField(money.rentPrice),
  );
  const investmentBudgetMin = firstDefined(
    moneyField(demandEd.investmentBudgetMin),
    moneyField(money.investmentBudgetMin),
  );
  const investmentBudgetMax = firstDefined(
    moneyField(demandEd.investmentBudgetMax),
    moneyField(money.investmentBudgetMax),
  );
  const askingPrice = firstDefined(
    moneyField(finding.askingPrice),
    moneyField(money.askingPriceMin),
    moneyField(money.askingPrice),
  );
  const priceQualifier = firstDefined(
    asString(money.qualifier),
    asString(asRecord((Array.isArray(money.mentions) ? money.mentions[0] : null) || {}).qualifier),
  );
  const moneyDisplay = firstDefined(
    asString(money.display),
    asString(asRecord((Array.isArray(money.mentions) ? money.mentions[0] : null) || {}).display),
  );

  const city = firstDefined(asString(locationObj.city), asString(ed.city));
  const district = firstDefined(asString(locationObj.district), asString(ed.district));
  const ward = firstDefined(asString(locationObj.ward));
  const street = firstDefined(asString(locationObj.street));
  const project = firstDefined(asString(locationObj.project));
  const normalizedLocations = asStringArray(locationObj.normalizedLocations);
  const locationPrimary = firstDefined(
    asString(finding.primaryLocation),
    [city, district, street, project].filter(Boolean).join(', ') || null,
    normalizedLocations[0] ?? null,
    asString(locationObj.primary),
    asString(leadAnalysis.region),
  );

  const propertyTypes =
    firstDefined(
      finding.propertyType ? [finding.propertyType] : null,
      asStringArray(property.propertyTypes),
      asStringArray(ed.propertyTypes),
      asStringArray(leadAnalysis.propertyTypes),
    ) || [];

  const areaObj = asRecord(ed.area);
  const features = {
    ...asRecord(property.features),
    ...asRecord(areaObj.features),
  } as Record<string, boolean>;

  const roadWidthMeters = firstDefined(
    asNumber(property.roadWidthMeters),
    asNumber(areaObj.roadWidthMeters),
  );
  const pavementWidthMeters = firstDefined(
    asNumber(property.pavementWidthMeters),
    asNumber(areaObj.pavementWidthMeters),
  );
  const direction = firstDefined(
    asString(property.direction),
    asString(areaObj.direction),
    asString(ed.direction),
  );

  const otherRequirements = [
    ...asStringArray(requirementsObj.customRequirements),
    ...asStringArray(requirementsObj.otherRequirements),
    ...Object.entries(requirementsObj)
      .filter(
        ([k, v]) =>
          !['customRequirements', 'otherRequirements', 'carAccess', 'mainRoad', 'nearCenter', 'nearSea', 'cashflow', 'businessUse', 'investmentPurpose'].includes(k) &&
          v === true,
      )
      .map(([k]) => k),
  ];

  const purpose = firstDefined(
    asString(demandEd.purpose),
    asString(intelligence.purpose),
    asString(leadAnalysis.purpose),
  );

  const title = asString(finding.title) || 'Lead signal';
  const rawContent = firstDefined(
    asString(contentEd.fullOriginalContent),
    asString(sc?.contentText),
    asString(ed.originalContent),
  );

  // Soft-correct unknown OR misclassified demand when body is clearly a listing
  let effectiveClassification = classification;
  let effectiveActorRole = actorRole;
  let effectiveIntent = intent;
  const listingBody =
    Boolean(rawContent) &&
    /(nhỉnh\s*[\d.,]+\s*t[yỷ]|có\s*lô\s*đất|xem\s*đất|hotline|diện\s*tích\s*[:\-]?\s*\d|hướng\s*(đông|tây|nam|bắc)|đường\s*\d+m|lề\s*\d+m)/i.test(
      rawContent!,
    ) &&
    !/(cần\s*mua|tìm\s*mua|muốn\s*mua|cần\s*thuê|tìm\s*thuê|khách\s*cần)/i.test(rawContent!);
  if (
    listingBody &&
    (!effectiveClassification ||
      effectiveClassification === 'unknown' ||
      (DEMAND.has(effectiveClassification) && effectiveActorRole !== 'supply_side'))
  ) {
    effectiveClassification = 'seller';
    effectiveActorRole = 'supply_side';
    effectiveIntent = 'sell';
  }

  const isDemand =
    Boolean(effectiveClassification) &&
    DEMAND.has(effectiveClassification!) &&
    effectiveActorRole === 'demand_side';
  const isSupply =
    (Boolean(effectiveClassification) && SUPPLY.has(effectiveClassification!)) ||
    effectiveActorRole === 'supply_side';

  const displayBudgetLabel = (() => {
    if (moneyDisplay) return moneyDisplay;
    if (effectiveClassification === 'renter' || effectiveIntent === 'rent') {
      const label = formatResolvedBudget(rentBudgetMin, rentBudgetMax ?? buyerBudgetMax, {
        period: 'month',
      });
      return label === 'Chưa xác định' ? formatResolvedBudget(buyerBudgetMin, buyerBudgetMax) : label;
    }
    if (isSupply) {
      if (askingPrice != null && (priceQualifier === 'slightly_above' || priceQualifier === 'above')) {
        const base = formatResolvedBudget(askingPrice, askingPrice);
        return base === 'Chưa xác định' ? 'Chưa xác định' : `Trên ${base.replace(/^Từ\s+/i, '')}`;
      }
      const ask = formatResolvedBudget(askingPrice, askingPrice);
      return ask === 'Chưa xác định'
        ? formatResolvedBudget(buyerBudgetMin, buyerBudgetMax)
        : ask;
    }
    return formatResolvedBudget(buyerBudgetMin, buyerBudgetMax);
  })();

  const needFromAi = firstDefined(
    asString(finding.needSummary),
    asString(demandEd.needSummary),
    asString(intelligence.needSummary),
  );
  const cleanedAiNeed = cleanLeadSummary(needFromAi, title);
  const aiLooksLikeBuyerOnSupply =
    isSupply &&
    cleanedAiNeed &&
    /khách\s*cần\s*(mua|thuê)|nhà\s*đầu\s*tư\s*tìm/i.test(cleanedAiNeed);
  const needSummary =
    (!aiLooksLikeBuyerOnSupply && cleanedAiNeed) ||
    buildDeterministicNeedSummary({
      classification: effectiveClassification,
      location: locationPrimary,
      propertyTypes,
      budgetLabel: displayBudgetLabel,
      purpose,
      rawContent,
      areaMinM2: firstDefined(
        asNumber(property.areaMinM2),
        asNumber(property.areaMin),
        asNumber(areaObj.areaMinM2),
      ),
      areaMaxM2: firstDefined(
        asNumber(property.areaMaxM2),
        asNumber(property.areaMax),
        asNumber(areaObj.areaMaxM2),
      ),
      roadWidthMeters,
      pavementWidthMeters,
      direction,
    });

  const rawSummary = firstDefined(
    asString(intelligence.summary),
    asString(finding.summary),
    asString(leadAnalysis.summary),
  );
  const summary = cleanLeadSummary(rawSummary, finding.title) || needSummary;
  const supplyShort = isSupply
    ? buildSupplyShortDescription({
        propertyTypes,
        features,
        contactDisplay: contactDisplayName || (personName !== 'Chưa xác định' ? personName : null),
        primaryPhone,
        phoneCount: phoneStrings.length,
      })
    : null;
  const shortDescription = firstDefined(
    supplyShort,
    asString(contentEd.shortDescription),
    cleanLeadSummary(rawContent?.slice(0, 280) || null, title),
  );

  const recommendedAction = firstDefined(
    asString(intelligence.recommendedAction),
    asString(leadAnalysis.recommendedAction),
  );

  const reasons = [
    ...asStringArray(finding.reasons),
    ...asStringArray(intelligence.reasons),
    ...asStringArray(ed.reasons),
  ];

  const warnings: string[] = [];
  const colClass = asString(finding.classification);
  const edClass = asString(ed.classification) || asString(leadAnalysis.classification);
  if (colClass && edClass && colClass !== edClass && DEMAND.has(colClass) !== DEMAND.has(edClass)) {
    warnings.push(`DATA_INCONSISTENT: column classification=${colClass} vs extracted=${edClass}`);
  }
  if (titleImpliesDemand(title) && (!classification || classification === 'unknown')) {
    warnings.push('DATA_INCONSISTENT: title implies buyer/renter but classification unknown/null');
  }
  if (finding.score != null && finalScore == null && asNumber(finding.score)! >= 70) {
    warnings.push(
      `LEGACY_SCORE_IGNORED: finding.score=${finding.score} không dùng làm finalScore`,
    );
  }
  if (asNumber(finding.finalScore) != null && !colClass && !asString(finding.actorRole)) {
    warnings.push('DATA_INCONSISTENT: finalScore set nhưng classification/actorRole null');
  }

  const dataInconsistent = warnings.some(w => w.startsWith('DATA_INCONSISTENT'));

  let analysisStatus: AnalysisStatus = 'not_analyzed';
  if (dataInconsistent) analysisStatus = 'inconsistent';
  else if (asString(ed.analysisError) || asString(intelligence.error)) analysisStatus = 'failed';
  else if (
    !classification ||
    classification === 'unknown' ||
    !actorRole ||
    actorRole === 'unknown'
  ) {
    analysisStatus = finalScore == null && leadFitScore == null ? 'not_analyzed' : 'needs_review';
  } else if (aiScore == null && (finalScore != null || leadFitScore != null)) {
    analysisStatus = 'partial';
  } else if (finalScore != null || leadFitScore != null || colClass) {
    analysisStatus = 'analyzed';
  } else {
    analysisStatus = 'needs_review';
  }

  const scoreStatus = resolveScoreStatus({
    stored: asString(finding.scoreStatus),
    classification,
    actorRole,
    finalScore,
    provisionalScore,
    aiScore,
    analysisStatus,
    dataInconsistent,
  });

  const effectiveScore =
    scoreStatus === 'scored'
      ? finalScore
      : scoreStatus === 'provisional'
        ? provisionalScore ?? finalScore
        : null;

  const showAsConfirmedLead =
    Boolean(effectiveClassification) &&
    DEMAND.has(effectiveClassification!) &&
    effectiveActorRole === 'demand_side' &&
    effectiveScore != null &&
    !dataInconsistent;

  const displayScoreLabel =
    scoreStatus === 'failed'
      ? 'Phân tích lỗi'
      : scoreStatus === 'needs_review'
        ? 'Cần xem lại'
        : scoreStatus === 'provisional' && effectiveScore != null
          ? `${effectiveScore} tạm tính`
          : scoreStatus === 'scored' && effectiveScore != null
            ? String(effectiveScore)
            : 'Cần xem lại';

  const displayClassificationLabel =
    showAsConfirmedLead || (effectiveClassification && effectiveClassification !== 'unknown')
      ? CLASS_LABELS[effectiveClassification!] || effectiveClassification!
      : analysisStatus === 'needs_review' || analysisStatus === 'not_analyzed'
        ? 'Cần xem lại'
        : CLASS_LABELS[effectiveClassification || 'unknown'] || 'Chưa xác định';

  const canonicalUrl = firstDefined(
    asString(sourceEd.canonicalUrl),
    asString(sc?.canonicalUrl),
  );

  return {
    findingId: asString(finding.id),
    scannedContentId: asString(finding.scannedContentId),
    classification: effectiveClassification,
    intent: effectiveIntent,
    actorRole: effectiveActorRole,
    priority,
    urgency,
    confidence,
    keywordScore,
    aiScore,
    leadFitScore,
    finalScore: scoreStatus === 'scored' || scoreStatus === 'provisional' ? effectiveScore : finalScore,
    provisionalScore,
    analysisStatus,
    scoreStatus,
    person: {
      name: personName,
      facebookName,
      facebookProfileUrl,
      type: personType || 'unknown',
    },
    contact: {
      phones: phoneDetails,
      primaryPhone,
      primaryPhoneDetail,
      secondaryPhones,
      emails: asStringArray(contact.emails),
      zalo:
        phoneDetails.find(p => p.label === 'zalo')?.normalized ||
        asString(contact.zalo),
      contactConfidence: asNumber(contact.contactConfidence),
      displayName: contactDisplayName || (personName !== 'Chưa xác định' ? personName : null),
    },
    demand: {
      needSummary,
      buyerBudgetMin,
      buyerBudgetMax,
      rentBudgetMin,
      rentBudgetMax,
      investmentBudgetMin,
      investmentBudgetMax,
      purpose,
      transactionTimeline: firstDefined(
        asString(demandEd.transactionTimeline),
        asString(intelligence.transactionTimeline),
      ),
    },
    property: {
      propertyTypes,
      areaMinM2: firstDefined(
        asNumber(property.areaMinM2),
        asNumber(property.areaMin),
        asNumber(areaObj.areaMinM2),
      ),
      areaMaxM2: firstDefined(
        asNumber(property.areaMaxM2),
        asNumber(property.areaMax),
        asNumber(areaObj.areaMaxM2),
      ),
      frontageMeters: firstDefined(
        asNumber(property.frontageMeters),
        asNumber(areaObj.frontageMeters),
      ),
      depthMeters: firstDefined(asNumber(property.depthMeters), asNumber(areaObj.depthMeters)),
      roadWidthMeters,
      pavementWidthMeters,
      bedrooms: asNumber(property.bedrooms),
      floors: asNumber(property.floors),
      legalStatus: asString(property.legalStatus),
      direction,
      features,
    },
    location: {
      city,
      district,
      ward,
      street,
      project,
      normalizedLocations,
      primary: locationPrimary,
    },
    requirements: {
      carAccess: asBool(requirementsObj.carAccess),
      mainRoad: asBool(requirementsObj.mainRoad),
      nearCenter: asBool(requirementsObj.nearCenter),
      nearSea: asBool(requirementsObj.nearSea),
      cashflow: asBool(requirementsObj.cashflow),
      businessUse: asBool(requirementsObj.businessUse),
      investmentPurpose: asBool(requirementsObj.investmentPurpose),
      otherRequirements,
    },
    source: {
      sourceName: firstDefined(asString(finding.source?.name), asString(sourceEd.sourceName)),
      sourceType: firstDefined(asString(finding.source?.type), asString(sourceEd.sourceType)),
      groupName: firstDefined(asString(sourceEd.groupName), asString(finding.source?.name)),
      authorName: facebookName,
      authorUrl: facebookProfileUrl,
      canonicalUrl,
      publishedAt: toIso(sourceEd.publishedAt ?? sc?.publishedAt),
      collectedAt: toIso(sourceEd.collectedAt ?? sc?.collectedAt),
    },
    content: {
      title,
      shortDescription: shortDescription || needSummary,
      fullOriginalContent: rawContent,
    },
    intelligence: {
      summary,
      reasons,
      recommendedAction,
      replySuggestion: asString(intelligence.replySuggestion),
      missingInformation: asStringArray(intelligence.missingInformation),
      risks: asStringArray(intelligence.risks),
    },
    title,
    summary: summary || needSummary || 'Chưa có tóm tắt',
    recommendedAction,
    phones: phoneStrings,
    primaryPhone,
    budgetMin: buyerBudgetMin,
    budgetMax: buyerBudgetMax,
    askingPrice,
    primaryLocation: locationPrimary,
    propertyTypes,
    requirementsList: otherRequirements,
    consistencyWarnings: warnings,
    dataInconsistent,
    displayScoreLabel,
    displayClassificationLabel,
    displayBudgetLabel,
    displayPersonName: personName === 'Chưa xác định' ? 'Chưa xác định tên' : personName,
    priceQualifier,
    showAsConfirmedLead,
    isDemandSide: Boolean(isDemand),
    isSupplySide: Boolean(isSupply) || effectiveActorRole === 'broker',
    matchingEnabled: Boolean(isDemand),
    promoteAvailable: Boolean(isDemand) || !isSupply,
    externalInventoryPreferred: Boolean(isSupply) || effectiveClassification === 'broker',
  };
}

/** Explicit pure entrypoint name (identical to resolveLeadIntelligence). */
export function resolveLeadIntelligenceFromSources(finding: FindingLike): LeadIntelligence {
  return resolveLeadIntelligence(finding);
}
