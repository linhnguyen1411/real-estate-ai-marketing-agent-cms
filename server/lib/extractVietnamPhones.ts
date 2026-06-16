export interface VietnamPhoneExtractResult {
  validPhones: string[];
  possiblePhones: string[];
  rawMatches: string[];
}

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060\u00AD]/g;
const FULLWIDTH_DIGIT = /[\uFF10-\uFF19]/g;

const MOBILE_PREFIX = /^0(3|5|7|8|9)\d{8}$/;

const CONTEXT_KEYWORDS = [
  /\bsdt\b/i,
  /\bso\s*dien\s*thoai\b/i,
  /\bphone\b/i,
  /\bzalo\b/i,
  /\bl(ien|\s+)he\b/i,
  /\blh\b/i,
  /\bcall\b/i,
  /\binbox\b/i,
  /\bib\b/i,
  /\bchinh\s*chu\b/i
];

/** Candidat có separator: space . - * / () */
const PHONE_CANDIDATE_PATTERNS = [
  /(?:\+?\s*\(?\s*84\s*\)?[\s.\-*/()]*)?(?:\+?\s*)?0[\s.\-*/()]*(?:3|5|7|8|9)(?:[\s.\-*\/()]*\d){7,12}/gi,
  /\+?\s*84[\s.\-*/()]*(?:3|5|7|8|9)(?:[\s.\-*\/()]*\d){8,12}/gi,
  /\b0(?:3|5|7|8|9)(?:[\s.\-*\/()]*\d){7,12}\b/gi
];

export function preparePhoneText(text: string): string {
  return text
    .replace(FULLWIDTH_DIGIT, ch => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(ZERO_WIDTH, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[oO](?=\d)/g, '0');
}

export function maskPhoneFalsePositives(text: string): string {
  let t = preparePhoneText(text);
  t = t.replace(/https?:\/\/[^\s]+/gi, ' ');
  t = t.replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ');
  t = t.replace(/\b\d+(?:[.,]\d+)?\s*(?:tỷ|ty|ti|triệu|tr|tys|billion)\b/gi, ' ');
  t = t.replace(/\b\d+(?:[.,]\d+)?\s*m2\b/gi, ' ');
  t = t.replace(/\b\d+\s*[x×]\s*\d+\b/gi, ' ');
  t = t.replace(/\b\d{12,}\b/g, ' ');
  return t;
}

export function isValidVietnamMobile10(digits: string): boolean {
  return digits.length === 10 && MOBILE_PREFIX.test(digits);
}

export function normalizeToValidMobile10(digits: string): string | null {
  if (!digits) return null;

  if (digits.startsWith('84') && digits.length >= 11) {
    const local = `0${digits.slice(2, 11)}`;
    if (isValidVietnamMobile10(local)) return local;
  }

  if (digits.startsWith('0') && digits.length === 10 && isValidVietnamMobile10(digits)) {
    return digits;
  }

  if (digits.startsWith('0') && digits.length === 11 && '35789'.includes(digits[1])) {
    const trimmed = digits.slice(0, 10);
    if (isValidVietnamMobile10(trimmed)) return trimmed;
  }

  return null;
}

function hasMaskedPlaceholder(raw: string): boolean {
  return /x{2,}/i.test(raw) || /\*{3,}/.test(raw);
}

function isLikelyFalsePositive(raw: string, digits: string, _context: string): boolean {
  if (hasMaskedPlaceholder(raw)) return true;
  if (digits.length > 11) return true;

  const rawTrim = raw.trim().toLowerCase();

  // Match chính là giá / diện tích / ngày — không phải SĐT
  if (/^\d+(?:[.,]\d+)?\s*(?:tỷ|ty|ti|triệu)\b/.test(rawTrim)) return true;
  if (/^\d+\s*tr\b/.test(rawTrim) && digits.length <= 6) return true;
  if (/^\d+(?:[.,]\d+)?\s*m2\b/.test(rawTrim)) return true;
  if (/^\d+\s*[x×]\s*\d+/.test(rawTrim)) return true;
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(rawTrim)) return true;

  // SĐT mobile VN — KHÔNG loại vì bài BĐS có "5 tỷ", "100m2" ở gần trong cùng post
  if (normalizeToValidMobile10(digits)) return false;
  if (digits.startsWith('0') && '35789'.includes(digits[1]) && digits.length >= 8 && digits.length <= 11) {
    return false;
  }
  if (digits.startsWith('84') && digits.length >= 11 && normalizeToValidMobile10(`0${digits.slice(2, 11)}`)) {
    return false;
  }

  return false;
}

function classifyDigits(digits: string, raw: string, context: string): 'valid' | 'possible' | 'skip' {
  if (isLikelyFalsePositive(raw, digits, context)) return 'skip';

  const valid = normalizeToValidMobile10(digits);
  if (valid) return 'valid';

  if (digits.startsWith('0') && digits.length >= 8 && digits.length <= 9 && '35789'.includes(digits[1])) {
    return 'possible';
  }

  if (digits.startsWith('0') && digits.length === 11 && '35789'.includes(digits[1])) {
    return 'possible';
  }

  if (digits.startsWith('84') && digits.length >= 10 && digits.length <= 12) {
    const local = `0${digits.slice(2)}`;
    if (local.length >= 8 && local.length <= 11 && '35789'.includes(local[1])) {
      return local.length === 10 && isValidVietnamMobile10(local) ? 'valid' : 'possible';
    }
  }

  return 'skip';
}

export function computePhoneContextConfidence(text: string, rawMatch: string): number {
  const idx = text.toLowerCase().indexOf(rawMatch.toLowerCase().slice(0, Math.min(6, rawMatch.length)));
  const window = idx >= 0
    ? text.slice(Math.max(0, idx - 50), idx + rawMatch.length + 50)
    : text;
  return CONTEXT_KEYWORDS.some(re => re.test(window)) ? 10 : 0;
}

export function extractVietnamPhones(text: string): VietnamPhoneExtractResult {
  const prepared = preparePhoneText(text);
  const masked = maskPhoneFalsePositives(prepared);

  const rawMatches: string[] = [];
  const rawSeen = new Set<string>();

  for (const pattern of PHONE_CANDIDATE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = masked.match(pattern) || [];
    for (const match of matches) {
      const trimmed = match.trim();
      const key = trimmed.replace(/\s+/g, ' ').toLowerCase();
      if (!rawSeen.has(key)) {
        rawSeen.add(key);
        rawMatches.push(trimmed);
      }
    }
  }

  // Quét thêm chuỗi số liên tiếp sau làm sạch (Facebook zero-width)
  const digitStream = masked.replace(/[^\d+]/g, ' ');
  const chunks = digitStream.split(/\s+/).filter(Boolean);
  for (const chunk of chunks) {
    const digits = chunk.replace(/\D/g, '');
    for (let i = 0; i <= digits.length - 8; i++) {
      if (digits[i] !== '0' || !'35789'.includes(digits[i + 1])) continue;
      for (const len of [10, 11, 9, 8]) {
        if (i + len > digits.length) continue;
        const slice = digits.slice(i, i + len);
        const synthetic = slice;
        const key = `d:${slice}`;
        if (rawSeen.has(key)) continue;
        const kind = classifyDigits(slice, synthetic, masked);
        if (kind !== 'skip') {
          rawSeen.add(key);
          rawMatches.push(slice);
        }
      }
    }
  }

  const validPhones: string[] = [];
  const possiblePhones: string[] = [];
  const validSet = new Set<string>();
  const possibleSet = new Set<string>();

  for (const raw of rawMatches) {
    const digits = raw.replace(/\D/g, '');
    const kind = classifyDigits(digits, raw, masked);

    if (kind === 'skip') continue;

    if (kind === 'valid') {
      const phone = normalizeToValidMobile10(digits)!;
      if (!validSet.has(phone)) {
        validSet.add(phone);
        validPhones.push(phone);
      }
      continue;
    }

    const possibleKey = digits.startsWith('0') ? digits : `0${digits}`;
    if (validSet.has(possibleKey) || validSet.has(normalizeToValidMobile10(digits) || '')) continue;
    if (!possibleSet.has(possibleKey)) {
      possibleSet.add(possibleKey);
      possiblePhones.push(possibleKey);
    }
  }

  const filteredPossible = possiblePhones.filter(p => {
    const norm = normalizeToValidMobile10(p);
    return !norm || !validSet.has(norm);
  });

  return {
    validPhones,
    possiblePhones: filteredPossible,
    rawMatches
  };
}

/** Backward-compatible helper */
export function extractPhones(text: string): string[] {
  return extractVietnamPhones(text).validPhones;
}

export function extractFirstPhone(text: string): string {
  return extractVietnamPhones(text).validPhones[0] || '';
}

export function computeExtractConfidence(text: string, result: VietnamPhoneExtractResult): number {
  if (!result.validPhones.length && !result.possiblePhones.length) return 0;
  let score = result.validPhones.length ? 15 : 5;
  for (const raw of result.rawMatches.slice(0, 3)) {
    score += computePhoneContextConfidence(text, raw);
  }
  return Math.min(score, 30);
}
