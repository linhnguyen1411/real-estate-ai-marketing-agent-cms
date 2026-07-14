/**
 * Location extractor focused on the Da Nang / Quang Nam real-estate area.
 *
 * Deterministic dictionary match. Does NOT invent ward/district when the post
 * does not mention it. Callers (source/mission) may supply extra aliases.
 */

export const LOCATION_EXTRACTOR_VERSION = 'location-1';

type LocationKind = 'city' | 'district' | 'ward' | 'street' | 'landmark';

interface LocationEntry {
  canonical: string;
  kind: LocationKind;
  city?: string;
  district?: string;
  /** lowercase surface forms to search for */
  aliases: string[];
  /** low-confidence alias (needs context) */
  soft?: boolean;
}

const DA_NANG = 'Đà Nẵng';

const DICTIONARY: LocationEntry[] = [
  { canonical: DA_NANG, kind: 'city', city: DA_NANG, aliases: ['đà nẵng', 'da nang', 'tp đà nẵng'] },
  { canonical: 'Nam Đà Nẵng', kind: 'landmark', city: DA_NANG, aliases: ['nam đà nẵng'] },
  // districts
  { canonical: 'Ngũ Hành Sơn', kind: 'district', city: DA_NANG, aliases: ['ngũ hành sơn'] },
  { canonical: 'Sơn Trà', kind: 'district', city: DA_NANG, aliases: ['sơn trà'] },
  { canonical: 'Hải Châu', kind: 'district', city: DA_NANG, aliases: ['hải châu'] },
  { canonical: 'Thanh Khê', kind: 'district', city: DA_NANG, aliases: ['thanh khê'] },
  { canonical: 'Liên Chiểu', kind: 'district', city: DA_NANG, aliases: ['liên chiểu'] },
  { canonical: 'Cẩm Lệ', kind: 'district', city: DA_NANG, aliases: ['cẩm lệ'] },
  { canonical: 'Điện Bàn', kind: 'district', city: 'Quảng Nam', aliases: ['điện bàn'] },
  { canonical: 'Hội An', kind: 'city', city: 'Quảng Nam', aliases: ['hội an'] },
  // wards / sub-areas
  { canonical: 'Nam Hòa Xuân', kind: 'ward', city: DA_NANG, district: 'Cẩm Lệ', aliases: ['nam hòa xuân'] },
  { canonical: 'Hòa Xuân', kind: 'ward', city: DA_NANG, district: 'Cẩm Lệ', aliases: ['hòa xuân'] },
  { canonical: 'Hòa Quý', kind: 'ward', city: DA_NANG, district: 'Ngũ Hành Sơn', aliases: ['hòa quý'] },
  { canonical: 'Hòa Khánh', kind: 'ward', city: DA_NANG, district: 'Liên Chiểu', aliases: ['hòa khánh'] },
  { canonical: 'Hòa Minh', kind: 'ward', city: DA_NANG, district: 'Liên Chiểu', aliases: ['hòa minh'] },
  { canonical: 'Hòa Hiệp', kind: 'ward', city: DA_NANG, district: 'Liên Chiểu', aliases: ['hòa hiệp'] },
  { canonical: 'Điện Ngọc', kind: 'ward', city: 'Quảng Nam', district: 'Điện Bàn', aliases: ['điện ngọc'] },
  { canonical: 'Điện Nam', kind: 'ward', city: 'Quảng Nam', district: 'Điện Bàn', aliases: ['điện nam'] },
  { canonical: 'Cẩm Phô', kind: 'ward', city: 'Quảng Nam', district: 'Hội An', aliases: ['cẩm phô'] },
  // streets
  { canonical: 'Võ Nguyên Giáp', kind: 'street', city: DA_NANG, aliases: ['võ nguyên giáp'] },
  { canonical: 'Ngô Quyền', kind: 'street', city: DA_NANG, aliases: ['ngô quyền'] },
  { canonical: 'Tôn Đức Thắng', kind: 'street', city: DA_NANG, aliases: ['tôn đức thắng'] },
  { canonical: 'Mai Đăng Chơn', kind: 'street', city: DA_NANG, district: 'Ngũ Hành Sơn', aliases: ['mai đăng chơn'] },
  // landmarks / projects
  { canonical: 'FPT City', kind: 'landmark', city: DA_NANG, district: 'Ngũ Hành Sơn', aliases: ['fpt city', 'đại học fpt', 'fpt university', 'làng đại học'] },
  { canonical: 'FPT City', kind: 'landmark', city: DA_NANG, district: 'Ngũ Hành Sơn', aliases: ['fpt', 'gần fpt'], soft: true },
  { canonical: 'Non Nước', kind: 'landmark', city: DA_NANG, district: 'Ngũ Hành Sơn', aliases: ['non nước', 'biển non nước'] },
  { canonical: 'Mỹ Khê', kind: 'landmark', city: DA_NANG, district: 'Sơn Trà', aliases: ['mỹ khê', 'biển mỹ khê'] },
  { canonical: 'Cocobay', kind: 'landmark', city: DA_NANG, aliases: ['cocobay'] },
  { canonical: 'Sơn Trà Ocean View', kind: 'landmark', city: DA_NANG, district: 'Sơn Trà', aliases: ['sơn trà ocean view'] },
  { canonical: 'Sun Cosmo', kind: 'landmark', city: DA_NANG, aliases: ['sun cosmo'] },
  { canonical: 'Sun Symphony', kind: 'landmark', city: DA_NANG, aliases: ['sun symphony'] },
];

// standalone "ĐN" abbreviation -> Đà Nẵng (only when clearly a token)
const DN_ABBR_RE = /(?:^|[\s(.,])đn(?:$|[\s).,])/i;

export interface LocationExtractionResult {
  rawMentions: string[];
  normalizedLocations: string[];
  primaryLocation: string | null;
  district: string | null;
  ward: string | null;
  street: string | null;
  city: string | null;
  confidence: number;
  version: string;
}

const KIND_PRIORITY: Record<LocationKind, number> = {
  street: 5,
  ward: 4,
  landmark: 3,
  district: 2,
  city: 1,
};

export function extractLocation(text: string, extraAliases: LocationEntry[] = []): LocationExtractionResult {
  const empty: LocationExtractionResult = {
    rawMentions: [],
    normalizedLocations: [],
    primaryLocation: null,
    district: null,
    ward: null,
    street: null,
    city: null,
    confidence: 0,
    version: LOCATION_EXTRACTOR_VERSION,
  };
  if (!text) return empty;

  const lower = text.toLowerCase();
  const rawMentions: string[] = [];
  const matched: Array<{ entry: LocationEntry; confidence: number }> = [];

  for (const entry of [...DICTIONARY, ...extraAliases]) {
    for (const alias of entry.aliases) {
      if (lower.includes(alias)) {
        rawMentions.push(alias);
        matched.push({ entry, confidence: entry.soft ? 0.5 : 0.9 });
        break;
      }
    }
  }

  if (DN_ABBR_RE.test(text)) {
    rawMentions.push('ĐN');
    matched.push({ entry: DICTIONARY[0], confidence: 0.7 });
  }

  if (matched.length === 0) return empty;

  const normalizedLocations = [...new Set(matched.map(m => m.entry.canonical))];

  // primary: most specific kind, then highest confidence
  const best = [...matched].sort(
    (a, b) =>
      KIND_PRIORITY[b.entry.kind] - KIND_PRIORITY[a.entry.kind] || b.confidence - a.confidence,
  )[0];

  const district =
    matched.find(m => m.entry.kind === 'district')?.entry.canonical ??
    best.entry.district ??
    null;
  const ward = matched.find(m => m.entry.kind === 'ward')?.entry.canonical ?? null;
  const street = matched.find(m => m.entry.kind === 'street')?.entry.canonical ?? null;
  const city =
    matched.find(m => m.entry.kind === 'city')?.entry.canonical ??
    best.entry.city ??
    null;

  return {
    rawMentions: [...new Set(rawMentions)],
    normalizedLocations,
    primaryLocation: best.entry.canonical,
    district,
    ward,
    street,
    city,
    confidence: best.confidence,
    version: LOCATION_EXTRACTOR_VERSION,
  };
}
