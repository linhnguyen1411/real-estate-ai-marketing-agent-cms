import type { Property } from '../../src/types';

const STOP_WORDS = new Set([
  'tai', 'can', 'dat', 'nha', 'the', 'and', 'cho', 'thue', 'ban', 'gia',
  'dep', 'moi', 'sun', 'group', 'da', 'nang', 'danang', 'khu', 'tai', 'dinh',
  'cu', 'gap', 'tam', 'huyet', 'lien', 'ke', 'city',
]);

/** Khu vực / dự án quen thuộc → mã slug dễ nhớ (vd. Mai Đăng Chơn → mdc) */
const ZONE_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /mai\s*dang\s*cho/i, code: 'mdc' },
  { pattern: /ba\s*tung/i, code: 'batung' },
  { pattern: /hoa\s*xuan/i, code: 'hoaxuan' },
  { pattern: /hoa\s*quy/i, code: 'hoaquy' },
  { pattern: /fpt\s*city/i, code: 'fptcity' },
  { pattern: /non\s*nuoc/i, code: 'nonnuoc' },
  { pattern: /ngu\s*hanh\s*son/i, code: 'nguhanhson' },
  { pattern: /son\s*tra/i, code: 'sontra' },
  { pattern: /lien\s*chieu/i, code: 'lienchieu' },
  { pattern: /cam\s*le/i, code: 'camle' },
  { pattern: /tho\s*quan/i, code: 'thoquan' },
];

const TYPE_CODES: Record<string, string> = {
  'Đất nền': 'datnen',
  'Nhà Phố': 'nhapho',
  'Căn Hộ': 'canho',
  Shophouse: 'shophouse',
  'Biệt thự': 'bietthu',
  Villa: 'villa',
};

function stripAccents(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

export function normalizeShortSlug(value: string): string {
  return stripAccents(value)
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function areaSuffix(property: Property): string {
  if (property.area && Number(property.area) > 0) {
    return String(Math.round(Number(property.area)));
  }
  return property.id.replace(/[^a-z0-9]/gi, '').slice(-4);
}

function findZoneCode(...parts: string[]): string | null {
  const haystack = stripAccents(parts.filter(Boolean).join(' '));
  for (const { pattern, code } of ZONE_PATTERNS) {
    if (pattern.test(haystack)) return code;
  }
  return null;
}

function initialsFromWords(text: string, maxWords = 3): string {
  const words = stripAccents(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  if (words.length < 2) return '';

  return words
    .slice(0, maxWords)
    .map((word) => word.slice(0, 2))
    .join('')
    .slice(0, 8);
}

export function suggestPropertyShortSlug(property: Property): string {
  const location = String(property.location || '').trim();
  const project = String(property.project_name || '').trim();
  const title = String(property.title || '').trim();
  const suffix = areaSuffix(property);

  // Ưu tiên khu vực / dự án + diện tích (vd. batung100, mdc650)
  const zoneCode = findZoneCode(location, project, title);
  if (zoneCode) {
    return normalizeShortSlug(`${zoneCode}${suffix}`);
  }

  // Loại hình + diện tích (vd. nhapho100, datnen120)
  const typeCode = TYPE_CODES[property.type] || '';
  if (typeCode) {
    return normalizeShortSlug(`${typeCode}${suffix}`);
  }

  // Fallback: viết tắt từ location (ổn định hơn title marketing)
  const locationInitials = initialsFromWords(location);
  if (locationInitials) {
    return normalizeShortSlug(`${locationInitials}${suffix}`);
  }

  const titleInitials = initialsFromWords(project || title);
  if (titleInitials) {
    return normalizeShortSlug(`${titleInitials}${suffix}`);
  }

  const compact = normalizeShortSlug(title).replace(/-/g, '').slice(0, 10);
  const idTail = property.id.replace(/[^a-z0-9]/gi, '').slice(-3);
  return normalizeShortSlug(`${compact}${idTail}`);
}

export function suggestBlogShortSlug(postSlug: string): string {
  const base = normalizeShortSlug(postSlug);
  return base.length > 20 ? base.slice(0, 20) : base;
}

export async function pickUniqueSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const normalized = normalizeShortSlug(base) || 'link';
  if (!(await isTaken(normalized))) return normalized;

  for (let i = 2; i <= 99; i += 1) {
    const candidate = `${normalized}-${i}`.slice(0, 32);
    if (!(await isTaken(candidate))) return candidate;
  }

  return `${normalized}-${Date.now().toString(36).slice(-4)}`;
}
