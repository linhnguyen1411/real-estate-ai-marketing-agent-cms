/**
 * Property type, area and demand (classification/intent) extractor.
 * Deterministic. Prioritizes buyer intent per sprint requirements.
 */

export const PROPERTY_EXTRACTOR_VERSION = 'property-1';

export type LeadClassification =
  | 'buyer'
  | 'renter'
  | 'seller'
  | 'landlord'
  | 'investor'
  | 'broker'
  | 'service'
  | 'discussion'
  | 'spam'
  | 'unknown';

export type LeadIntent = 'buy' | 'rent' | 'sell' | 'lease_out' | 'invest' | 'service' | 'unknown';

const PROPERTY_TYPES: string[] = [
  'đất nền',
  'đất ở',
  'đất thổ cư',
  'đất mặt tiền',
  'đất kiệt',
  'quỹ đất',
  'lô đất',
  'nhà phố',
  'nhà mặt tiền',
  'nhà kiệt',
  'biệt thự',
  'căn hộ dịch vụ',
  'căn hộ',
  'chung cư',
  'shophouse',
  'mặt bằng',
  'văn phòng',
  'kho',
  'xưởng',
  'khách sạn',
  'homestay',
  'dãy trọ',
  'phòng trọ',
  'resort',
];

export interface AreaExtraction {
  areaMinM2: number | null;
  areaMaxM2: number | null;
  frontageMeters: number | null;
  depthMeters: number | null;
  roadWidthMeters: number | null;
  pavementWidthMeters: number | null;
  direction: string | null;
  rawMentions: string[];
  features: Record<string, boolean>;
}

export function extractPropertyTypes(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const type of PROPERTY_TYPES) {
    if (lower.includes(type) && !found.includes(type)) found.push(type);
  }
  // Canonical English slug for land listings (external inventory / filters).
  if (
    found.some(t => /đất|land/.test(t)) ||
    /(?:có\s*)?(?:lô\s*)?đất\b|đất\s*nền|đất\s*ở/.test(lower)
  ) {
    if (!found.includes('land')) found.unshift('land');
  }
  return found;
}

export function extractArea(text: string): AreaExtraction {
  const result: AreaExtraction = {
    areaMinM2: null,
    areaMaxM2: null,
    frontageMeters: null,
    depthMeters: null,
    roadWidthMeters: null,
    pavementWidthMeters: null,
    direction: null,
    rawMentions: [],
    features: {},
  };
  if (!text) return result;
  const lower = text.toLowerCase();

  const num = (v: string) => Number(v.replace(',', '.'));
  /** Parse "5m5" / "5,5m" / "5.5m" → meters */
  const parseMeterToken = (raw: string): number | null => {
    const compact = raw.toLowerCase().replace(/\s+/g, '');
    const mixed = compact.match(/^(\d+)m(\d)$/);
    if (mixed) return Number(`${mixed[1]}.${mixed[2]}`);
    const plain = compact.match(/^(\d+(?:[.,]\d+)?)m?$/);
    if (plain) return num(plain[1]);
    return null;
  };

  // frontage x depth: "5x20", "5 x 20"
  const cross = lower.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/);
  if (cross) {
    result.frontageMeters = num(cross[1]);
    result.depthMeters = num(cross[2]);
    result.rawMentions.push(cross[0]);
    const area = result.frontageMeters * result.depthMeters;
    if (area > 0) {
      result.areaMinM2 = area;
      result.areaMaxM2 = area;
    }
  }

  // "ngang 5 dài 20", "ngang 10m"
  const ngang = lower.match(/ngang\s*(\d+(?:[.,]\d+)?)\s*m?/);
  if (ngang) {
    result.frontageMeters = num(ngang[1]);
    result.rawMentions.push(ngang[0]);
  }
  const dai = lower.match(/dài\s*(\d+(?:[.,]\d+)?)\s*m?/);
  if (dai) {
    result.depthMeters = num(dai[1]);
    result.rawMentions.push(dai[0]);
    if (result.frontageMeters && result.depthMeters && result.areaMinM2 == null) {
      const area = result.frontageMeters * result.depthMeters;
      result.areaMinM2 = area;
      result.areaMaxM2 = area;
    }
  }

  // đường 5m5 / đường 5,5m
  const road = lower.match(/đường\s*(\d+m\d|\d+(?:[.,]\d+)?\s*m?)/i);
  if (road) {
    const w = parseMeterToken(road[1].replace(/\s+/g, ''));
    if (w != null) {
      result.roadWidthMeters = w;
      result.rawMentions.push(road[0].trim());
    }
  }
  // lề 3m
  const pavement = lower.match(/lề\s*(\d+m\d|\d+(?:[.,]\d+)?\s*m?)/i);
  if (pavement) {
    const w = parseMeterToken(pavement[1].replace(/\s+/g, ''));
    if (w != null) {
      result.pavementWidthMeters = w;
      result.rawMentions.push(pavement[0].trim());
    }
  }

  // Hướng Đông Nam
  const dir = text.match(/hướng\s*([ĐđA-Za-zÀ-ỹ\s]{2,30}?)(?:\.|,|\n|hotline|zalo|diện|$)/i);
  if (dir) {
    const normalized = dir[1].replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
    // keep Vietnamese casing better
    result.direction = dir[1].replace(/\s+/g, ' ').trim().replace(/^./, c => c.toUpperCase());
    result.rawMentions.push(dir[0].trim());
    void normalized;
  }

  // features
  if (/gần\s*núi/i.test(text)) result.features.nearMountain = true;
  if (/gần\s*sông/i.test(text)) result.features.nearRiver = true;
  if (/gần\s*biển/i.test(text)) result.features.nearSea = true;
  if (/khu\s*dân\s*cư\s*mới/i.test(text)) result.features.newResidentialArea = true;
  if (/dân\s*trí\s*cao/i.test(text)) result.features.highEducationCommunity = true;

  // explicit area with square-meter unit: "500m2", "500 m²", "khoảng 650m2", "trên 500m2"
  const areaMatches = [
    ...lower.matchAll(/(trên|dưới|khoảng|tầm)?\s*(\d{2,5}(?:[.,]\d+)?)\s*(?:m2|m²|mét\s*vuông|m\s*vuông)/g),
  ];
  // "diện tích 100m" (bare metre after "diện tích")
  const dtMatch = lower.match(/diện\s*tích\s*(?:khoảng|tầm)?\s*[:\-]?\s*(\d{2,5}(?:[.,]\d+)?)\s*m(?![2²x×])/);
  if (dtMatch) {
    const value = num(dtMatch[1]);
    if (value >= 10 && value <= 100_000 && result.areaMinM2 == null) {
      result.areaMinM2 = value;
      result.areaMaxM2 = value;
      result.rawMentions.push(dtMatch[0].trim());
    }
  }
  for (const m of areaMatches) {
    const value = num(m[2]);
    if (value < 10 || value > 100_000) continue; // filter noise
    result.rawMentions.push(m[0].trim());
    const bound = m[1];
    if (bound === 'dưới') {
      result.areaMaxM2 = result.areaMaxM2 ?? value;
    } else if (bound === 'trên') {
      result.areaMinM2 = result.areaMinM2 ?? value;
    } else if (result.areaMinM2 == null) {
      result.areaMinM2 = value;
      result.areaMaxM2 = value;
    }
  }

  result.rawMentions = [...new Set(result.rawMentions)];
  return result;
}

interface DemandResult {
  classification: LeadClassification;
  intent: LeadIntent;
  confidence: number;
  requirements: string[];
}

const BROKER_RE = /(môi\s*giới|moi\s*gioi|ký\s*gửi|ky\s*gui|sàn\s*gd|chốt\s*nhanh|hoa\s*hồng|group\s*bđs|nhận\s*ký\s*gửi)/i;
const BUY_RE = /(cần\s*mua|tìm\s*mua|muốn\s*mua|cần\s*tìm\s*(?:mua|nhà|đất)|đang\s*tìm\s*(?:mua|nhà|đất)|cần\s*nhà|cần\s*đất|hỏi\s*mua)/i;
const RENT_NEED_RE = /(cần\s*thuê|tìm\s*thuê|muốn\s*thuê)/i;
const LEASE_RE = /(cho\s*thuê|còn\s*trống|cho\s*share)/i;
const SELL_RE = /(cần\s*bán|bán\s*gấp|chính\s*chủ\s*bán|ra\s*hàng|bán\s*nhà|bán\s*đất|bán\s*lô|sang\s*nhượng)/i;
/** Investor DEMAND only — must have seek verbs; bare "dòng tiền" on a listing is supply amenity. */
const INVEST_DEMAND_RE =
  /((cần|tìm|muốn|đang\s*tìm).{0,40}(đầu\s*tư|dòng\s*tiền|cashflow)|(đầu\s*tư|dòng\s*tiền|cashflow).{0,40}(cần|tìm|muốn))/i;
const INVEST_WORD_RE = /(đầu\s*tư|dòng\s*tiền|sinh\s*lời|đầu\s*cơ|lướt\s*sóng|cashflow)/i;
const LISTING_SUPPLY_RE =
  /(đang\s*khai\s*thác|dòng\s*tiền\s*sẵn|nhỉnh\s*[\d.,]+\s*t[yỷ]|dt\s*[\d.,]+m|ngang\s*[\d.,]+\s*m|dãy\s*trọ|phòng\s*trọ\s*\d|kiệt\s*ô\s*tô|có\s*lô\s*đất|có\s*đất|xem\s*đất|xem\s*nhà|hotline|diện\s*tích\s*[:\-]?\s*\d|hướng\s*(đông|tây|nam|bắc)|đường\s*\d+m|lề\s*\d+m|giá\s*tốt)/i;
const SPAM_RE = /(vay\s*vốn|đáo\s*hạn|casino|lô\s*đề|link\s*bio|kèo|shopee\s*affiliate)/i;

const REQUIREMENT_PATTERNS: Array<[RegExp, string]> = [
  [/ô\s*tô\s*(?:vào|đỗ|tránh|quay)/i, 'ô tô vào'],
  [/xe\s*hơi\s*vào/i, 'ô tô vào'],
  [/dòng\s*tiền/i, 'có dòng tiền'],
  [/pháp\s*lý\s*(?:rõ|sạch|đầy\s*đủ)/i, 'pháp lý rõ ràng'],
  [/sổ\s*(?:đỏ|hồng)/i, 'có sổ'],
  [/gần\s*biển/i, 'gần biển'],
  [/gần\s*núi/i, 'gần núi'],
  [/gần\s*sông/i, 'gần sông'],
  [/kinh\s*doanh/i, 'kinh doanh được'],
];

export function extractDemand(text: string): DemandResult {
  const lower = text.toLowerCase();
  let classification: LeadClassification = 'unknown';
  let intent: LeadIntent = 'unknown';
  let confidence = 0.4;

  const looksLikeListing =
    LISTING_SUPPLY_RE.test(lower) && !BUY_RE.test(lower) && !RENT_NEED_RE.test(lower);

  if (SPAM_RE.test(lower)) {
    classification = 'spam';
    intent = 'unknown';
    confidence = 0.7;
  } else if (BUY_RE.test(lower)) {
    // buyer intent takes priority even if "đầu tư/dòng tiền" appears
    classification = 'buyer';
    intent = 'buy';
    confidence = 0.85;
  } else if (RENT_NEED_RE.test(lower)) {
    classification = 'renter';
    intent = 'rent';
    confidence = 0.8;
  } else if (looksLikeListing || SELL_RE.test(lower)) {
    // Cashflow listing (dãy trọ đang khai thác / dòng tiền sẵn / nhỉnh X tỷ) = supply
    classification = BROKER_RE.test(lower) ? 'broker' : 'seller';
    intent = 'sell';
    confidence = looksLikeListing ? 0.8 : BROKER_RE.test(lower) ? 0.65 : 0.7;
  } else if (LEASE_RE.test(lower)) {
    classification = 'landlord';
    intent = 'lease_out';
    confidence = 0.7;
  } else if (BROKER_RE.test(lower) && !INVEST_DEMAND_RE.test(lower)) {
    classification = 'broker';
    intent = 'service';
    confidence = 0.7;
  } else if (INVEST_DEMAND_RE.test(lower)) {
    classification = 'investor';
    intent = 'invest';
    confidence = 0.75;
  } else if (INVEST_WORD_RE.test(lower) && /(cần|tìm|muốn)/i.test(lower)) {
    classification = 'investor';
    intent = 'invest';
    confidence = 0.6;
  }

  const requirements: string[] = [];
  for (const [re, label] of REQUIREMENT_PATTERNS) {
    if (re.test(lower) && !requirements.includes(label)) requirements.push(label);
  }

  return { classification, intent, confidence, requirements };
}

export interface PropertyExtractionResult {
  propertyTypes: string[];
  area: AreaExtraction;
  classification: LeadClassification;
  intent: LeadIntent;
  confidence: number;
  requirements: string[];
  version: string;
}

export function extractPropertyData(text: string): PropertyExtractionResult {
  const demand = extractDemand(text);
  return {
    propertyTypes: extractPropertyTypes(text),
    area: extractArea(text),
    classification: demand.classification,
    intent: demand.intent,
    confidence: demand.confidence,
    requirements: demand.requirements,
    version: PROPERTY_EXTRACTOR_VERSION,
  };
}
