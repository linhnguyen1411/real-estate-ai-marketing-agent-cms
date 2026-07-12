/**
 * Vietnamese phone number extractor.
 *
 * Deterministic. Prefers Zalo / named-contact numbers as primary.
 */

export const PHONE_EXTRACTOR_VERSION = 'phone-2';

export type PhoneLabel = 'zalo' | 'hotline' | 'contact' | 'other';

export interface ExtractedPhone {
  raw: string;
  normalized: string;
  e164: string;
  valid: boolean;
  confidence: number;
  source: 'post_body' | 'author' | 'other';
  label?: PhoneLabel;
  contactName?: string;
}

const MOBILE_SECOND_DIGITS = new Set(['3', '5', '7', '8', '9']);
const PHONE_CANDIDATE_RE = /(?<![\d])(\+?84|0)[\s.\-]?([\d][\d .\-]{7,15}\d)(?![\d])/g;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizeVietnamPhone(raw: string): { normalized: string; e164: string; valid: boolean } | null {
  let digits = digitsOnly(raw);
  if (digits.startsWith('84')) {
    digits = '0' + digits.slice(2);
  } else if (!digits.startsWith('0') && digits.length === 9 && MOBILE_SECOND_DIGITS.has(digits[0])) {
    digits = '0' + digits;
  }
  if (!digits.startsWith('0')) return null;
  const isMobile = digits.length === 10 && MOBILE_SECOND_DIGITS.has(digits[1]);
  const isLandline = (digits.length === 10 || digits.length === 11) && digits[1] === '2';
  if (!isMobile && !isLandline) {
    if (digits.length < 10 || digits.length > 11) return null;
  }
  return { normalized: digits, e164: '+84' + digits.slice(1), valid: isMobile || isLandline };
}

function labelAround(text: string, index: number, length: number): {
  label: PhoneLabel;
  contactName?: string;
  boost: number;
} {
  // Prefer the label immediately before the number (same line / short window).
  const before = text.slice(Math.max(0, index - 30), index);
  const after = text.slice(index + length, index + length + 40);

  const nameMatch = after.match(
    /^\s*(?:[-–—:]\s*)?(Ms\.?|Mr\.?|Mrs\.?|Anh|Chị|Cô|Chú|Bác)\s+([A-Za-zÀ-ỹĐđ]{2,20})/iu,
  );
  if (/hotline|hot\s*line/i.test(before)) {
    return { label: 'hotline', boost: 0.02 };
  }
  if (/zalo/i.test(before)) {
    return {
      label: 'zalo',
      contactName: nameMatch
        ? `${nameMatch[1].replace(/\.$/, '')} ${nameMatch[2]}`.trim()
        : undefined,
      boost: 0.12,
    };
  }
  if (nameMatch) {
    return {
      label: 'contact',
      contactName: `${nameMatch[1].replace(/\.$/, '')} ${nameMatch[2]}`.trim(),
      boost: 0.1,
    };
  }
  return { label: 'other', boost: 0 };
}

export function extractPhones(
  text: string,
  source: ExtractedPhone['source'] = 'post_body',
): ExtractedPhone[] {
  if (!text) return [];
  const found = new Map<string, ExtractedPhone>();

  for (const match of text.matchAll(PHONE_CANDIDATE_RE)) {
    const raw = (match[1] + match[2]).trim();
    const rawDigits = digitsOnly(raw);
    if (rawDigits.length < 9 || rawDigits.length > 12) continue;
    const norm = normalizeVietnamPhone(raw);
    if (!norm) continue;
    const idx = match.index ?? 0;
    const around = labelAround(text, idx, match[0].length);

    let confidence = 0.4;
    if (norm.valid) {
      confidence = MOBILE_SECOND_DIGITS.has(norm.normalized[1]) ? 0.95 : 0.8;
    }
    confidence = Math.min(1, confidence + around.boost);

    const existing = found.get(norm.normalized);
    if (existing && existing.confidence >= confidence) continue;

    found.set(norm.normalized, {
      raw: raw.replace(/\s+/g, ' '),
      normalized: norm.normalized,
      e164: norm.e164,
      valid: norm.valid,
      confidence,
      source,
      label: around.label,
      contactName: around.contactName,
    });
  }

  return [...found.values()];
}

export interface PhoneExtractionResult {
  phones: ExtractedPhone[];
  primaryPhone: string | null;
  version: string;
}

/** Primary: contact-name phone → zalo → hotline → first valid */
export function selectPrimaryPhone(phones: ExtractedPhone[]): string | null {
  if (!phones.length) return null;
  const ranked = [...phones].sort((a, b) => {
    const rank = (p: ExtractedPhone) => {
      if (p.contactName && p.label === 'zalo') return 400 + p.confidence;
      if (p.contactName) return 350 + p.confidence;
      if (p.label === 'zalo') return 300 + p.confidence;
      if (p.label === 'hotline') return 150 + p.confidence;
      return 100 + p.confidence + (p.valid ? 10 : 0);
    };
    return rank(b) - rank(a);
  });
  return ranked[0]?.normalized ?? null;
}

export function extractPhoneData(text: string): PhoneExtractionResult {
  const phones = extractPhones(text);
  return {
    phones,
    primaryPhone: selectPrimaryPhone(phones),
    version: PHONE_EXTRACTOR_VERSION,
  };
}
