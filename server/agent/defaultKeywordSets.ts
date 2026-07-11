/**
 * Default keyword packs for Nam Đà Nẵng real-estate lead analysis.
 * Applied at resolve-time when source/mission leave keywords empty.
 * Do NOT write these into AgentSource.config automatically.
 */

export const DEFAULT_REAL_ESTATE_KEYWORDS = {
  buyer: [
    'cần mua',
    'muốn mua',
    'đang cần mua',
    'tìm mua',
    'đang tìm mua',
    'cần tìm mua',
    'cần tìm',
    'đang tìm',
    'ai có căn',
    'ai có nhà',
    'ai có đất',
    'có căn nào',
    'có nhà nào',
    'có lô nào',
    'có đất nào',
    'cần căn',
    'tìm căn',
    'tìm nhà',
    'tìm đất',
    'tìm lô',
    'mua nhà',
    'mua đất',
    'mua căn hộ',
    'mua chung cư',
    'mua shophouse',
    'mua biệt thự',
    'mua mặt bằng',
    'mua nhà phố',
    'mua đất nền',
    'mua đất mặt tiền',
    'mua quỹ đất',
    'tìm quỹ đất',
    'cần quỹ đất',
    'tìm đất lớn',
    'cần đất lớn',
    'tìm đất xây căn hộ',
    'tìm đất xây khách sạn',
    'tìm đất kinh doanh',
    'tìm đất làm căn hộ',
    'tìm đất làm homestay',
    'tìm đất làm showroom',
    'tìm đất làm văn phòng',
    'tìm mặt bằng mua',
    'mua để ở',
    'mua ở',
    'mua đầu tư',
    'mua khai thác',
    'mua giữ tiền',
    'mua dòng tiền',
    'chốt nhanh',
    'mua nhanh',
    'cần gấp',
    'ưu tiên chính chủ',
    'ưu tiên giá tốt',
    'ưu tiên pháp lý rõ ràng',
    'ưu tiên sổ đỏ',
    'ưu tiên đường lớn',
    'ưu tiên ô tô vào',
    'ưu tiên mặt tiền',
    'ưu tiên gần biển',
    'ưu tiên gần fpt',
    'ưu tiên nam đà nẵng',
  ],
  renter: [
    'cần thuê',
    'muốn thuê',
    'đang tìm thuê',
    'tìm thuê',
    'thuê nhà',
    'thuê căn',
    'thuê căn hộ',
    'thuê chung cư',
    'thuê mặt bằng',
    'thuê shop',
    'thuê cửa hàng',
    'thuê văn phòng',
    'thuê phòng',
    'ở ghép',
  ],
  sellerListing: [
    'bán nhà',
    'bán đất',
    'bán căn',
    'bán lô',
    'chính chủ bán',
    'cần bán',
    'rao bán',
    'giá bán',
    'sổ đỏ',
    'sổ hồng',
    'pháp lý',
    'diện tích',
    'mặt tiền',
    'đường ô tô',
  ],
  regionSouthDanang: [
    'đà nẵng',
    'nam đà nẵng',
    'ngũ hành sơn',
    'hòa xuân',
    'cẩm lệ',
    'ngũ hành',
    'mỹ an',
    'mỹ khê',
    'sơn trà',
    'hải châu',
    'liên chiểu',
    'hòa khánh',
    'fpt',
    'ngũ hành sơn',
    'võ chí công',
    'trường sa',
    'hoàng sa',
    'nguyễn tất thành',
    'tô hiến thành',
    'tôn đản',
  ],
  negative: [
    'tuyển dụng',
    'tuyển nv',
    'tuyển sale',
    'bán sim',
    'sang nhượng quán',
    'ship đồ',
    'bán xe',
    'cho thuê xe',
    'dạy học',
    'khóa học',
    'mlm',
    'đa cấp',
  ],
} as const;

/** Flattened positive pack used when source/mission leave keywords empty. */
export function getDefaultPositiveKeywords(): string[] {
  return unique([
    ...DEFAULT_REAL_ESTATE_KEYWORDS.buyer,
    ...DEFAULT_REAL_ESTATE_KEYWORDS.renter,
    ...DEFAULT_REAL_ESTATE_KEYWORDS.sellerListing,
    ...DEFAULT_REAL_ESTATE_KEYWORDS.regionSouthDanang,
  ]);
}

export function getDefaultNegativeKeywords(): string[] {
  return [...DEFAULT_REAL_ESTATE_KEYWORDS.negative];
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const value = item.trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
