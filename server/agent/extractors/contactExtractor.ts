/**
 * Contact name extractor from Vietnamese listing body text.
 */

export const CONTACT_EXTRACTOR_VERSION = 'contact-1';

export interface ExtractedContactName {
  contactName: string;
  displayName: string;
  honorific: string | null;
  associatedPhone: string | null;
  confidence: number;
  rawMention: string;
}

const HONORIFIC =
  '(?:Ms\\.?|Mr\\.?|Mrs\\.?|Anh|Chị|Cô|Chú|Bác|Em)';

const NAME =
  '([A-ZÀ-ỸĐ][a-zà-ỹđ]*(?:\\s+[A-ZÀ-ỸĐ][a-zà-ỹđ]*){0,2}|[A-ZÀ-ỸĐ]{1,12}|[A-Za-zÀ-ỹĐđ]{2,20})';

const PHONE_NEAR =
  '((?:\\+?84|0)[\\d.\\s\\-]{8,14}\\d)';

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizeLocalPhone(raw: string): string | null {
  let d = digitsOnly(raw);
  if (d.startsWith('84')) d = `0${d.slice(2)}`;
  if (d.length === 10 && d.startsWith('0')) return d;
  if (d.length === 11 && d.startsWith('0')) return d;
  return null;
}

const PATTERNS: Array<{
  re: RegExp;
  pick: (m: RegExpMatchArray) => ExtractedContactName | null;
}> = [
  // Zalo: 0901989133 Ms Tú
  {
    re: new RegExp(
      `zalo\\s*[:\\-]?\\s*${PHONE_NEAR}\\s*(${HONORIFIC})\\s*${NAME}`,
      'iu',
    ),
    pick: m => {
      const honorific = m[2].replace(/\.$/, '');
      const name = m[3].trim();
      return {
        contactName: name,
        displayName: `${honorific} ${name}`.replace(/\s+/g, ' ').trim(),
        honorific,
        associatedPhone: normalizeLocalPhone(m[1]),
        confidence: 0.95,
        rawMention: m[0].trim(),
      };
    },
  },
  // Hotline: ... Ms Tú / liên hệ Ms Tú
  {
    re: new RegExp(
      `(?:liên\\s*hệ|lh|contact|zalo|hotline)?\\s*(${HONORIFIC})\\s*${NAME}`,
      'iu',
    ),
    pick: m => {
      const honorific = m[1].replace(/\.$/, '');
      const name = m[2].trim();
      if (/^(tại|đà|nẵng|đất|nhà|giá)$/i.test(name)) return null;
      return {
        contactName: name,
        displayName: `${honorific} ${name}`.replace(/\s+/g, ' ').trim(),
        honorific,
        associatedPhone: null,
        confidence: 0.8,
        rawMention: m[0].trim(),
      };
    },
  },
  // 0901989133 - Tú / 0901989133 Ms Tú
  {
    re: new RegExp(
      `${PHONE_NEAR}\\s*[\\-–—:]\\s*(?:(${HONORIFIC})\\s*)?${NAME}`,
      'iu',
    ),
    pick: m => {
      const honorific = m[2] ? m[2].replace(/\.$/, '') : null;
      const name = m[3].trim();
      if (name.length < 2) return null;
      return {
        contactName: name,
        displayName: honorific ? `${honorific} ${name}` : name,
        honorific,
        associatedPhone: normalizeLocalPhone(m[1]),
        confidence: 0.85,
        rawMention: m[0].trim(),
      };
    },
  },
];

export function extractContactNames(text: string): ExtractedContactName[] {
  if (!text) return [];
  const out: ExtractedContactName[] = [];
  const seen = new Set<string>();

  for (const { re, pick } of PATTERNS) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) {
      const hit = pick(m);
      if (!hit) continue;
      const key = hit.displayName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
  }

  return out.sort((a, b) => b.confidence - a.confidence);
}

export interface ContactExtractionResult {
  contacts: ExtractedContactName[];
  primaryContact: ExtractedContactName | null;
  version: string;
}

export function extractContactData(text: string): ContactExtractionResult {
  const contacts = extractContactNames(text);
  return {
    contacts,
    primaryContact: contacts[0] ?? null,
    version: CONTACT_EXTRACTOR_VERSION,
  };
}
