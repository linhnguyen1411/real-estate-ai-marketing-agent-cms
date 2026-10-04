/**
 * Listing Normalization & Clustering Engine.
 *
 * Implements Stage 2 of Master Plan:
 * 1. Data Normalization:
 *    - Property Type: Đất nền, Nhà phố, Căn hộ, Biệt thự, Mặt bằng / Shophouse
 *    - Area: Standardized to m²
 *    - Price & Unit Price: Standardized to VND and VND/m²
 *    - Specific Project Location: Parse Block and Lot (e.g. Nam Hòa Xuân B2-XX, B1-YY, Lô ZZ)
 * 2. Deduplication & Clustering (Property Signature):
 *    - Signature: [Khu vực] + [Block/Lô] + [Diện tích round 5m²] + [Nhóm giá ±5%]
 *    - Clustered historical posts & price evolution tracking
 * 3. Spam Filtering & Poster Classification (Broker vs. Owner).
 */

import crypto from 'crypto';
import type { DeterministicExtraction } from './extractors';

export type StandardPropertyType =
  | 'Đất nền'
  | 'Nhà phố'
  | 'Căn hộ'
  | 'Biệt thự'
  | 'Mặt bằng / Shophouse'
  | 'Khác';

export interface ProjectLotDetails {
  project: string | null;
  block: string | null;
  lot: string | null;
}

export interface NormalizedListing {
  standardPropertyType: StandardPropertyType;
  areaM2: number | null;
  priceVnd: number | null;
  unitPricePerM2Vnd: number | null;
  projectDetails: ProjectLotDetails;
  primaryLocation: string | null;
  propertySignature: string;
  isSpam: boolean;
  spamReason: string | null;
  authorType: 'broker' | 'owner' | 'unknown';
  authorConfidence: number;
}

export interface HistoricalPostEntry {
  sourceUrl: string;
  canonicalUrl?: string | null;
  authorName?: string | null;
  authorPhone?: string | null;
  priceVnd: number | null;
  postedAt: string;
  contentTextSnippet: string;
}

// Regex to capture Nam Hòa Xuân / project blocks & lots:
// e.g. "B2-12", "B2.12", "Block B2-45", "Lô 25", "Lô 1x", "L25", "Lô số 15"
const BLOCK_RE = /(?:block\s*|b\s*|khu\s*)([1234][\.\-_][\d]{1,3}|[a-z][\d]{1,2}[\.\-_][\d]{1,3}|[a-z][\d]{1,3})\b/i;
const LOT_RE = /(?:lô\s*(?:số\s*)?|l\s*)([\d]{1,3}[a-z]?|[\d]{1,2}x)\b/i;

// Owner commitment patterns
const OWNER_COMMIT_PATTERNS = [
  /chính\s*chủ\s*(?:bán|đứng\s*tên|cần\s*bán|gửi|xây\s*ở)/i,
  /không\s*qua\s*(?:trung\s*gian|môi\s*giới|cò)/i,
  /nhà\s*tôi\s*(?:xây|ở|cần\s*bán)/i,
  /đất\s*tôi\s*(?:chính\s*chủ|đứng\s*tên)/i,
  /sổ\s*đỏ\s*tên\s*tôi/i,
];

// Broker indicators
const BROKER_PATTERNS = [
  /nhận\s*ký\s*gửi/i,
  /hoa\s*hồng/i,
  /anh\s*em\s*(?:sale|môi\s*giới)/i,
  /group\s*bđs/i,
  /khách\s*ruột\s*gửi/i,
  /sàn\s*(?:bđs|giao\s*dịch)/i,
  /hỗ\s*trợ\s*vay\s*ngân\s*hàng/i,
  /chốt\s*nhanh\s*cho\s*khách/i,
];

export function extractProjectLotDetails(text: string): ProjectLotDetails {
  const lower = text.toLowerCase();
  let project: string | null = null;
  if (/nam\s*hòa\s*xuân/i.test(lower)) {
    project = 'Nam Hòa Xuân';
  } else if (/hòa\s*xuân/i.test(lower)) {
    project = 'Hòa Xuân';
  } else if (/fpt\s*city/i.test(lower)) {
    project = 'FPT City';
  } else if (/hòa\s*quý/i.test(lower)) {
    project = 'Hòa Quý';
  } else if (/sun\s*cosmo/i.test(lower)) {
    project = 'Sun Cosmo Residence';
  } else if (/sun\s*symphony/i.test(lower)) {
    project = 'Sun Symphony Residence';
  }

  let block: string | null = null;
  const blockMatch = text.match(BLOCK_RE);
  if (blockMatch) {
    block = blockMatch[1].toUpperCase().replace(/[\._]/g, '-');
    if (!block.startsWith('B') && !block.startsWith('b')) {
      block = `B${block}`;
    }
  }

  let lot: string | null = null;
  const lotMatch = text.match(LOT_RE);
  if (lotMatch) {
    lot = lotMatch[1].toUpperCase();
  }

  return { project, block, lot };
}

export function mapStandardPropertyType(types: string[]): StandardPropertyType {
  const joined = types.join(' ').toLowerCase();
  if (/đất|lô\s*đất|thổ\s*cư/.test(joined)) return 'Đất nền';
  if (/nhà\s*phố|nhà\s*mặt\s*tiền|nhà\s*kiệt|nhà\s*ở/.test(joined)) return 'Nhà phố';
  if (/căn\s*hộ|chung\s*cư/.test(joined)) return 'Căn hộ';
  if (/biệt\s*thự|villa/.test(joined)) return 'Biệt thự';
  if (/mặt\s*bằng|shophouse|văn\s*phòng|kho|xưởng/.test(joined)) return 'Mặt bằng / Shophouse';
  return 'Khác';
}

export function buildPropertySignature(input: {
  location: string | null;
  project?: string | null;
  block?: string | null;
  lot?: string | null;
  areaM2: number | null;
  priceVnd: number | null;
}): string {
  const locPart = (input.project || input.location || 'danang').trim().toLowerCase();
  const blockPart = input.block ? input.block.toLowerCase() : '';
  const lotPart = input.lot ? input.lot.toLowerCase() : '';
  // Round area to nearest 5m² buckets to tolerate minor typo/frontage variations (e.g. 100m vs 102m)
  const areaBucket = input.areaM2 ? Math.round(input.areaM2 / 5) * 5 : 0;
  // Round price to 5% buckets (e.g. 3.4B vs 3.5B cluster together)
  const priceBucket = input.priceVnd ? Math.round(input.priceVnd / 100_000_000) * 100_000_000 : 0;

  const rawKey = `${locPart}|${blockPart}|${lotPart}|${areaBucket}|${priceBucket}`;
  return crypto.createHash('md5').update(rawKey).digest('hex').slice(0, 16);
}

export function classifyAuthorType(text: string, phoneRecentListingCount = 0): {
  authorType: 'broker' | 'owner' | 'unknown';
  authorConfidence: number;
} {
  const lower = text.toLowerCase();

  // If phone has posted >= 3 different properties recently -> definitely broker
  if (phoneRecentListingCount >= 3) {
    return { authorType: 'broker', authorConfidence: 0.95 };
  }

  for (const re of BROKER_PATTERNS) {
    if (re.test(lower)) {
      return { authorType: 'broker', authorConfidence: 0.85 };
    }
  }

  for (const re of OWNER_COMMIT_PATTERNS) {
    if (re.test(lower)) {
      return { authorType: 'owner', authorConfidence: 0.85 };
    }
  }

  return { authorType: 'unknown', authorConfidence: 0.5 };
}

export function normalizeListing(
  contentText: string,
  extraction: DeterministicExtraction,
  phoneRecentListingCount = 0,
): NormalizedListing {
  const text = (contentText || '').trim();
  const lower = text.toLowerCase();

  const standardPropertyType = mapStandardPropertyType(extraction.property.propertyTypes);
  const areaM2 = extraction.property.area.areaMinM2 ?? extraction.property.area.areaMaxM2 ?? null;

  const priceVnd =
    extraction.money.askingPrice ??
    extraction.money.money[0]?.minAmountVnd ??
    extraction.money.money[0]?.maxAmountVnd ??
    null;

  let unitPricePerM2Vnd: number | null = null;
  if (priceVnd != null && areaM2 != null && areaM2 > 0) {
    unitPricePerM2Vnd = Math.round(priceVnd / areaM2);
  }

  const projectDetails = extractProjectLotDetails(text);
  const primaryLocation =
    projectDetails.project ||
    extraction.location.primaryLocation ||
    extraction.location.normalizedLocations[0] ||
    null;

  // Spam detection:
  // Post lacks both location AND price, or contains spam patterns
  let isSpam = false;
  let spamReason: string | null = null;

  if (!primaryLocation && priceVnd == null) {
    isSpam = true;
    spamReason = 'Không có thông tin vị trí và không có mức giá';
  } else if (/(?:vay\s*vốn|đáo\s*hạn|cờ\s*bạc|tài\s*xỉu|casino|lô\s*đề)/i.test(lower)) {
    isSpam = true;
    spamReason = 'Chứa từ khóa dịch vụ tài chính/tín dụng rác';
  }

  const { authorType, authorConfidence } = classifyAuthorType(text, phoneRecentListingCount);

  const propertySignature = buildPropertySignature({
    location: primaryLocation,
    project: projectDetails.project,
    block: projectDetails.block,
    lot: projectDetails.lot,
    areaM2,
    priceVnd,
  });

  return {
    standardPropertyType,
    areaM2,
    priceVnd,
    unitPricePerM2Vnd,
    projectDetails,
    primaryLocation,
    propertySignature,
    isSpam,
    spamReason,
    authorType,
    authorConfidence,
  };
}
