/**
 * Domain classification + primary transaction object + real-estate relevance gate.
 * Determines WHAT is being bought/sold/rented before buyer/seller labeling.
 */

export const DOMAIN_CLASSIFICATIONS = [
  'real_estate',
  'vehicle',
  'consumer_goods',
  'employment',
  'financial_service',
  'general_service',
  'social_discussion',
  'unknown',
] as const;

export type DomainClassification = (typeof DOMAIN_CLASSIFICATIONS)[number];

export const TRANSACTION_OBJECT_CATEGORIES = [
  'real_estate',
  'vehicle',
  'electronics',
  'furniture',
  'employment',
  'service',
  'finance',
  'other',
  'unknown',
] as const;

export type TransactionObjectCategory = (typeof TRANSACTION_OBJECT_CATEGORIES)[number];

export type RealEstateNormalizedType =
  | 'land'
  | 'house'
  | 'apartment'
  | 'condominium'
  | 'villa'
  | 'shophouse'
  | 'hotel'
  | 'homestay'
  | 'resort'
  | 'warehouse'
  | 'factory'
  | 'office'
  | 'commercial_space'
  | 'rental_room'
  | 'boarding_house'
  | 'real_estate_project'
  | 'external_property_inventory'
  | 'unknown_real_estate';

export type VehicleNormalizedType =
  | 'motorcycle'
  | 'scooter'
  | 'car'
  | 'truck'
  | 'bicycle'
  | 'vehicle_other'
  | 'motorcycle_or_scooter';

export type DomainConfidence = 'high' | 'medium' | 'low';

export type RelevanceDecision = 'accept' | 'reject' | 'needs_review';

export interface TransactionObject {
  category: TransactionObjectCategory;
  normalizedType: string;
  rawMentions: string[];
  confidence: DomainConfidence;
  businessPurpose?: string | null;
}

export interface DomainResult {
  classification: DomainClassification;
  confidence: DomainConfidence;
  primaryObject: string;
  matchedSignals: string[];
  rejectionReason: string | null;
  transactionObject: TransactionObject;
}

export interface RealEstateRelevanceResult {
  isRealEstateRelevant: boolean;
  relevanceScore: number;
  positiveEvidence: string[];
  conflictingEvidence: string[];
  decision: RelevanceDecision;
  reasonCode: string;
  domain: DomainResult;
}

/** Vehicle/access attributes of a property — NOT the transaction object. */
const RE_ATTRIBUTE_VEHICLE_RES: Array<[RegExp, string]> = [
  [/kiệt\s*(?:xe\s*)?m[aá]y/i, 'attr:kiệt xe máy'],
  [/kiệt\s*ô\s*tô/i, 'attr:kiệt ô tô'],
  [/đường\s*ô\s*tô(?:\s*vào)?/i, 'attr:đường ô tô'],
  [/ô\s*tô\s*vào/i, 'attr:ô tô vào'],
  [/xe\s*hơi\s*vào/i, 'attr:xe hơi vào'],
  [/chỗ\s*đậu\s*xe/i, 'attr:chỗ đậu xe'],
  [/bãi\s*đỗ\s*xe/i, 'attr:bãi đỗ xe'],
  [/gara\s*(?:ô\s*tô|oto|xe)?/i, 'attr:gara'],
  [/chỗ\s*để\s*xe/i, 'attr:chỗ để xe'],
  [/ưu\s*tiên\s*ô\s*tô/i, 'attr:ưu tiên ô tô'],
];

const RE_PROPERTY_NOUNS: Array<[RegExp, RealEstateNormalizedType, string]> = [
  [/lô\s*đất|đất\s*nền|quỹ\s*đất|đất\s*mặt\s*tiền|(?<![a-zà-ỹ])đất(?![a-zà-ỹ])/i, 'land', 'noun:đất'],
  [/nhà\s*phố|nhà\s*mặt\s*tiền|nhà\s*kiệt|nhà\s*ở|(?<![a-zà-ỹ])nhà(?![a-zà-ỹ])/i, 'house', 'noun:nhà'],
  [/căn\s*hộ|chung\s*cư/i, 'apartment', 'noun:căn hộ'],
  [/biệt\s*thự|villa/i, 'villa', 'noun:biệt thự'],
  [/shophouse|shop\s*house/i, 'shophouse', 'noun:shophouse'],
  [/khách\s*sạn/i, 'hotel', 'noun:khách sạn'],
  [/homestay/i, 'homestay', 'noun:homestay'],
  [/resort/i, 'resort', 'noun:resort'],
  [/mặt\s*bằng/i, 'commercial_space', 'noun:mặt bằng'],
  [/văn\s*phòng/i, 'office', 'noun:văn phòng'],
  [/nhà\s*xưởng|xưởng/i, 'factory', 'noun:xưởng'],
  [/\bkho\b/i, 'warehouse', 'noun:kho'],
  [/phòng\s*trọ|dãy\s*trọ/i, 'boarding_house', 'noun:phòng/dãy trọ'],
  [/bất\s*động\s*sản|\bbđs\b/i, 'unknown_real_estate', 'noun:BĐS'],
  [/dự\s*án/i, 'real_estate_project', 'noun:dự án'],
];

const RE_ATTRIBUTE_SIGNALS: Array<[RegExp, string]> = [
  [/\d+[\.,]?\d*\s*(?:m²|m2|mét\s*vuông)/i, 'attr:diện tích'],
  [/ngang\s*[\d.,]+\s*m/i, 'attr:ngang'],
  [/dài\s*[\d.,]+\s*m/i, 'attr:dài'],
  [/mặt\s*tiền/i, 'attr:mặt tiền'],
  [/\d+\s*tầng/i, 'attr:tầng'],
  [/phòng\s*ngủ|pn\b/i, 'attr:phòng ngủ'],
  [/hướng\s*(đông|tây|nam|bắc)/i, 'attr:hướng'],
  [/sổ\s*(đỏ|hồng|riêng)/i, 'attr:sổ'],
  [/thổ\s*cư|\bodt\b/i, 'attr:thổ cư'],
  [/kiệt|hẻm/i, 'attr:kiệt/hẻm'],
  [/\d+[\.,]?\d*\s*t[yỷ]/i, 'attr:giá tỷ'],
  [/phường|quận|hải\s*châu|ngũ\s*hành\s*sơn|sơn\s*trà|liên\s*chiểu|cẩm\s*lệ|thanh\s*khê|đà\s*nẵng/i, 'attr:địa điểm'],
];

const VEHICLE_OBJECTS: Array<[RegExp, VehicleNormalizedType, string]> = [
  [/xe\s*m[aá]y/i, 'motorcycle', 'obj:xe máy'],
  [/xe\s*ga\b/i, 'scooter', 'obj:xe ga'],
  [/xe\s*(?:số|tay\s*ga|côn\s*tay)/i, 'motorcycle', 'obj:xe số/tay ga'],
  [/xe\s*cũ(?!\s*(?:nhà|đất|căn))/i, 'vehicle_other', 'obj:xe cũ'],
  [/(?:ô\s*tô|oto|xe\s*hơi)(?:\s*cũ)?/i, 'car', 'obj:ô tô'],
  [/xe\s*tải/i, 'truck', 'obj:xe tải'],
  [/xe\s*đạp/i, 'bicycle', 'obj:xe đạp'],
  [/\b(?:honda|yamaha|suzuki|vision|air\s*blade|wave|lead|exciter|winner)\b/i, 'motorcycle', 'obj:hãng xe'],
  [/\bsh(?:\s*(?:mode|ý|y|125|150|160|350))?\b/i, 'scooter', 'obj:SH'],
];

const CONSUMER_OBJECTS: Array<[RegExp, string, string]> = [
  [/điện\s*thoại|smartphone|iphone|samsung/i, 'electronics', 'obj:điện thoại'],
  [/laptop|máy\s*tính|macbook/i, 'electronics', 'obj:máy tính'],
  [/tivi|tv\b|tủ\s*lạnh|máy\s*giặt|đồ\s*gia\s*dụng/i, 'electronics', 'obj:gia dụng'],
  [/bàn\s*ghế|sofa|giường|tủ\s*quần/i, 'furniture', 'obj:nội thất'],
];

const EMPLOYMENT_SIGNALS: Array<[RegExp, string]> = [
  [/tìm\s*việc|xin\s*việc|tuyển\s*dụng|tuyển\s*nhân\s*viên|cần\s*người\s*làm|tuyển\s*ctv/i, 'employment'],
];

const FINANCE_SIGNALS: Array<[RegExp, string]> = [
  [/vay\s*tiền|đáo\s*hạn|lãi\s*suất|cho\s*vay|tín\s*chấp|lô\s*đề|cá\s*độ/i, 'finance'],
  [/sim\s*(?:số|đẹp|vip)|bán\s*sim|mua\s*sim/i, 'finance'],
];

const TX_VERBS = {
  buy: /(?:cần|muốn|tìm|đang\s*tìm|đang\s*cần)?\s*mua|(?:cần|muốn|đang)\s*tìm(?!\s*việc)/i,
  sell: /(?:cần|muốn)?\s*bán|rao\s*bán|thanh\s*lý/i,
  rent: /(?:cần|muốn|tìm)\s*thuê/i,
  lease: /cho\s*thuê/i,
};

const BUSINESS_PURPOSE_RE =
  /(?:để\s*(?:mở|làm|kinh\s*doanh)|mở\s*cửa\s*hàng|kinh\s*doanh)\s*[^.]{0,40}/i;

function confidenceRank(c: DomainConfidence): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

function maxConfidence(a: DomainConfidence, b: DomainConfidence): DomainConfidence {
  return confidenceRank(a) >= confidenceRank(b) ? a : b;
}

function blankSpans(text: string, patterns: RegExp[]): { masked: string; labels: string[] } {
  let masked = text;
  const labels: string[] = [];
  for (const re of patterns) {
    masked = masked.replace(re, match => {
      labels.push(match.trim().slice(0, 40));
      return ' '.repeat(match.length);
    });
  }
  return { masked, labels };
}

function collectMatches(text: string, patterns: Array<[RegExp, string]>): string[] {
  const out: string[] = [];
  for (const [re, label] of patterns) {
    if (re.test(text)) out.push(label);
  }
  return out;
}

function detectBusinessPurpose(text: string): string | null {
  const m = text.match(BUSINESS_PURPOSE_RE);
  if (!m) return null;
  const raw = m[0].toLowerCase();
  if (/xe\s*m[aá]y|xe\s*ga|ô\s*tô|oto/.test(raw)) return 'motorcycle_shop';
  if (/điện\s*thoại|phone|mobile/.test(raw)) return 'phone_store';
  if (/cà\s*phê|quán|nhà\s*hàng/.test(raw)) return 'fnb';
  return raw.slice(0, 40);
}

function detectReObject(text: string): {
  type: RealEstateNormalizedType;
  signals: string[];
} | null {
  const signals: string[] = [];
  let type: RealEstateNormalizedType | null = null;
  for (const [re, normalized, label] of RE_PROPERTY_NOUNS) {
    if (re.test(text)) {
      signals.push(label);
      if (!type) type = normalized;
    }
  }
  if (!type) return null;
  return { type, signals };
}

function detectVehicleObject(text: string): {
  type: VehicleNormalizedType;
  signals: string[];
} | null {
  const signals: string[] = [];
  let type: VehicleNormalizedType | null = null;
  for (const [re, normalized, label] of VEHICLE_OBJECTS) {
    if (re.test(text)) {
      signals.push(label);
      if (!type) type = normalized;
    }
  }
  // motorcycle OR scooter phrasing
  if (/xe\s*m[aá]y/.test(text) && /xe\s*ga/.test(text)) {
    type = 'motorcycle_or_scooter';
  }
  if (!type) return null;
  return { type, signals };
}

function detectConsumerObject(text: string): {
  category: 'electronics' | 'furniture';
  type: string;
  signals: string[];
} | null {
  for (const [re, category, label] of CONSUMER_OBJECTS) {
    if (re.test(text)) {
      return {
        category: category as 'electronics' | 'furniture',
        type: category,
        signals: [label],
      };
    }
  }
  return null;
}

/**
 * Primary transaction object: what the poster wants to buy/sell/rent.
 */
export function detectTransactionObject(text: string): TransactionObject {
  const raw = String(text || '');
  const attrBlank = blankSpans(
    raw,
    RE_ATTRIBUTE_VEHICLE_RES.map(([re]) => re),
  );
  // Also blank business-purpose tails so "mặt bằng ... xe máy" keeps RE as object
  const purposeMatch = raw.match(BUSINESS_PURPOSE_RE);
  let working = attrBlank.masked;
  let businessPurpose: string | null = detectBusinessPurpose(raw);
  if (purposeMatch) {
    working = working.replace(purposeMatch[0], ' '.repeat(purposeMatch[0].length));
  }

  const reObj = detectReObject(working) || detectReObject(raw);
  const vehicleObj = detectVehicleObject(working);
  const vehicleInAttrsOnly =
    !vehicleObj && detectVehicleObject(raw) && attrBlank.labels.length > 0;
  const consumer = detectConsumerObject(working) || detectConsumerObject(raw);
  const employment = collectMatches(raw, EMPLOYMENT_SIGNALS);
  const finance = collectMatches(raw, FINANCE_SIGNALS);

  const hasBuy = TX_VERBS.buy.test(raw);
  const hasSell = TX_VERBS.sell.test(raw);
  const hasRent = TX_VERBS.rent.test(raw);
  const hasLease = TX_VERBS.lease.test(raw);
  const hasTx = hasBuy || hasSell || hasRent || hasLease;

  // Strong RE object present → real estate (even if vehicle words appear as attrs/purpose)
  if (reObj) {
    const attrSignals = collectMatches(raw, RE_ATTRIBUTE_SIGNALS);
    const confidence: DomainConfidence =
      reObj.signals.length >= 1 && (attrSignals.length > 0 || hasTx) ? 'high' : 'medium';
    return {
      category: 'real_estate',
      normalizedType: reObj.type,
      rawMentions: [...reObj.signals, ...attrSignals.slice(0, 4)],
      confidence,
      businessPurpose,
    };
  }

  // Vehicle as transaction object (attrs already blanked)
  if (vehicleObj && (hasTx || /giá|inbox|zalo|sđt|liên\s*hệ/i.test(raw))) {
    const conf: DomainConfidence =
      vehicleObj.signals.length >= 1 && hasTx ? 'high' : 'medium';
    return {
      category: 'vehicle',
      normalizedType: vehicleObj.type,
      rawMentions: vehicleObj.signals,
      confidence: conf,
      businessPurpose: null,
    };
  }

  if (vehicleInAttrsOnly) {
    // Vehicle words only in RE attributes but no RE noun — weak unknown
    return {
      category: 'unknown',
      normalizedType: 'unknown',
      rawMentions: attrBlank.labels.map(l => `attr:${l}`),
      confidence: 'low',
      businessPurpose,
    };
  }

  if (consumer && hasTx) {
    return {
      category: consumer.category,
      normalizedType: consumer.type,
      rawMentions: consumer.signals,
      confidence: 'high',
      businessPurpose: null,
    };
  }

  if (employment.length) {
    return {
      category: 'employment',
      normalizedType: 'job',
      rawMentions: employment,
      confidence: 'high',
      businessPurpose: null,
    };
  }

  if (finance.length) {
    return {
      category: 'finance',
      normalizedType: 'financial_product',
      rawMentions: finance,
      confidence: 'high',
      businessPurpose: null,
    };
  }

  // Generic buy/sell with no object → unknown
  if (hasTx) {
    return {
      category: 'unknown',
      normalizedType: 'unknown',
      rawMentions: hasBuy ? ['verb:mua'] : hasSell ? ['verb:bán'] : ['verb:thuê'],
      confidence: 'low',
      businessPurpose,
    };
  }

  return {
    category: 'unknown',
    normalizedType: 'unknown',
    rawMentions: [],
    confidence: 'low',
    businessPurpose,
  };
}

export function classifyDomain(text: string): DomainResult {
  const transactionObject = detectTransactionObject(text);
  const raw = String(text || '');
  const matchedSignals = [...transactionObject.rawMentions];

  const mapCategoryToDomain = (
    cat: TransactionObjectCategory,
  ): DomainClassification => {
    switch (cat) {
      case 'real_estate':
        return 'real_estate';
      case 'vehicle':
        return 'vehicle';
      case 'electronics':
      case 'furniture':
      case 'other':
        return 'consumer_goods';
      case 'employment':
        return 'employment';
      case 'finance':
        return 'financial_service';
      case 'service':
        return 'general_service';
      default:
        return 'unknown';
    }
  };

  let classification = mapCategoryToDomain(transactionObject.category);
  let confidence = transactionObject.confidence;
  let rejectionReason: string | null = null;
  let primaryObject = transactionObject.normalizedType;

  // Extra employment / finance if object unknown
  if (classification === 'unknown') {
    const emp = collectMatches(raw, EMPLOYMENT_SIGNALS);
    const fin = collectMatches(raw, FINANCE_SIGNALS);
    if (emp.length) {
      classification = 'employment';
      matchedSignals.push(...emp);
      confidence = 'high';
      primaryObject = 'job';
      rejectionReason = 'non_real_estate_employment';
    } else if (fin.length) {
      classification = 'financial_service';
      matchedSignals.push(...fin);
      confidence = 'high';
      primaryObject = 'financial_product';
      rejectionReason = 'non_real_estate_finance';
    }
  }

  if (classification === 'vehicle') {
    rejectionReason = 'non_real_estate_vehicle_request';
    primaryObject =
      transactionObject.normalizedType === 'motorcycle_or_scooter'
        ? 'motorcycle'
        : transactionObject.normalizedType;
  } else if (classification === 'consumer_goods') {
    rejectionReason = 'non_real_estate_consumer_goods';
  } else if (classification === 'employment') {
    rejectionReason = rejectionReason || 'non_real_estate_employment';
  } else if (classification === 'financial_service') {
    rejectionReason = rejectionReason || 'non_real_estate_finance';
  } else if (classification === 'general_service') {
    rejectionReason = 'non_real_estate_service';
  } else if (classification === 'real_estate') {
    rejectionReason = null;
  }

  return {
    classification,
    confidence,
    primaryObject,
    matchedSignals: [...new Set(matchedSignals)],
    rejectionReason,
    transactionObject,
  };
}

export function evaluateRealEstateRelevance(
  content: string,
  _extraction?: unknown,
  _analysis?: unknown,
): RealEstateRelevanceResult {
  const domain = classifyDomain(content);
  const positiveEvidence: string[] = [];
  const conflictingEvidence: string[] = [];

  if (domain.classification === 'real_estate') {
    positiveEvidence.push(...domain.matchedSignals);
    return {
      isRealEstateRelevant: true,
      relevanceScore: domain.confidence === 'high' ? 90 : domain.confidence === 'medium' ? 75 : 60,
      positiveEvidence,
      conflictingEvidence,
      decision: 'accept',
      reasonCode: 'real_estate_object',
      domain,
    };
  }

  const blocked: DomainClassification[] = [
    'vehicle',
    'consumer_goods',
    'employment',
    'financial_service',
    'general_service',
  ];

  if (blocked.includes(domain.classification)) {
    conflictingEvidence.push(...domain.matchedSignals);
    return {
      isRealEstateRelevant: false,
      relevanceScore: 0,
      positiveEvidence,
      conflictingEvidence,
      decision: 'reject',
      reasonCode: domain.rejectionReason || `non_real_estate_${domain.classification}`,
      domain,
    };
  }

  // unknown — check soft RE evidence without treating generic buy/phone as RE
  const raw = String(content || '');
  const attrBlank = blankSpans(
    raw,
    RE_ATTRIBUTE_VEHICLE_RES.map(([re]) => re),
  );
  const reObj = detectReObject(attrBlank.masked) || detectReObject(raw);
  const reAttrs = collectMatches(raw, RE_ATTRIBUTE_SIGNALS);
  if (reObj) {
    positiveEvidence.push(...reObj.signals, ...reAttrs.slice(0, 3));
    return {
      isRealEstateRelevant: true,
      relevanceScore: 70,
      positiveEvidence,
      conflictingEvidence,
      decision: 'accept',
      reasonCode: 'real_estate_evidence_on_unknown',
      domain: {
        ...domain,
        classification: 'real_estate',
        confidence: maxConfidence(domain.confidence, 'medium'),
        rejectionReason: null,
        primaryObject: reObj.type,
      },
    };
  }

  if (reAttrs.length >= 2) {
    positiveEvidence.push(...reAttrs);
    return {
      isRealEstateRelevant: true,
      relevanceScore: 55,
      positiveEvidence,
      conflictingEvidence,
      decision: 'needs_review',
      reasonCode: 'weak_real_estate_attributes',
      domain: {
        ...domain,
        classification: 'unknown',
        confidence: 'low',
      },
    };
  }

  // Generic demand with phone only → reject (not RE)
  if (/(?:cần|muốn|tìm)\s*mua|(?:cần|muốn)\s*bán/i.test(raw)) {
    conflictingEvidence.push('generic_transaction_without_re_object');
    return {
      isRealEstateRelevant: false,
      relevanceScore: 5,
      positiveEvidence,
      conflictingEvidence,
      decision: 'reject',
      reasonCode: 'generic_demand_no_real_estate_object',
      domain: {
        ...domain,
        rejectionReason: 'generic_demand_no_real_estate_object',
      },
    };
  }

  return {
    isRealEstateRelevant: false,
    relevanceScore: 20,
    positiveEvidence,
    conflictingEvidence: ['domain_unknown'],
    decision: 'needs_review',
    reasonCode: 'domain_unknown',
    domain,
  };
}

/** Mission/source domain gate: finding only if analysis domain matches mission domain. */
export function domainMatchesMission(
  analysisDomain: DomainClassification,
  missionDomain: string = 'real_estate',
): boolean {
  const wanted = String(missionDomain || 'real_estate').toLowerCase();
  if (wanted === 'real_estate') {
    return analysisDomain === 'real_estate';
  }
  return analysisDomain === wanted;
}

export function domainLabelVi(domain: DomainClassification): string {
  switch (domain) {
    case 'real_estate':
      return 'Bất động sản';
    case 'vehicle':
      return 'Xe cộ';
    case 'consumer_goods':
      return 'Hàng tiêu dùng';
    case 'employment':
      return 'Việc làm';
    case 'financial_service':
      return 'Tài chính';
    case 'general_service':
      return 'Dịch vụ';
    case 'social_discussion':
      return 'Thảo luận';
    default:
      return 'Chưa xác định';
  }
}
