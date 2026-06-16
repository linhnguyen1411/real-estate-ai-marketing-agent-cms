import { cleanFacebookNoise } from './cleanFacebookNoise';

const BDS_KEYWORDS = [
  'bán', 'cần bán', 'mua', 'cần mua', 'cho thuê', 'cần thuê', 'sang nhượng',
  'đất', 'nhà', 'căn hộ', 'mặt bằng', 'shophouse', 'lô', 'block', 'hướng',
  'giá', 'tỷ', 'triệu', 'm2', 'hoà xuân', 'hòa xuân', 'đà nẵng', 'da nang'
];

function stripDiacritics(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

export function hasRealEstateContext(text: string): boolean {
  const normalized = stripDiacritics(text);
  return BDS_KEYWORDS.some(kw => normalized.includes(stripDiacritics(kw)));
}

function findPhoneIndex(text: string, phoneRawMatch: string): number {
  const direct = text.indexOf(phoneRawMatch);
  if (direct >= 0) return direct;

  const digits = phoneRawMatch.replace(/\D/g, '');
  if (!digits) return -1;

  let searchFrom = 0;
  while (searchFrom < text.length) {
    const chunk = text.slice(searchFrom);
    const compact = chunk.replace(/[^\d+]/g, '');
    const rel = compact.indexOf(digits);
    if (rel < 0) break;

    let digitPos = 0;
    for (let i = 0; i < chunk.length; i++) {
      if (/\d/.test(chunk[i])) {
        if (digitPos === rel) return searchFrom + i;
        digitPos++;
      }
    }
    searchFrom += 1;
  }
  return -1;
}

export function extractLeadContextAroundPhone(
  blockText: string,
  phoneRawMatch: string
): { cleanContextText: string; phoneRawMatch: string } {
  const cleaned = cleanFacebookNoise(blockText);
  const idx = findPhoneIndex(cleaned, phoneRawMatch);

  if (idx < 0) {
    return { cleanContextText: cleaned.slice(0, 1300), phoneRawMatch };
  }

  const start = Math.max(0, idx - 800);
  const end = Math.min(cleaned.length, idx + phoneRawMatch.length + 500);
  const slice = cleaned.slice(start, end);
  return { cleanContextText: cleanFacebookNoise(slice), phoneRawMatch };
}
