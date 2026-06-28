import type { IntentDetectionResult } from './types';

const HIGH_INTENT_KEYWORDS = [
  'giá',
  'bảng giá',
  'còn căn',
  'còn lô',
  'gửi thông tin',
  'inbox',
  'ib',
  'quan tâm',
  'tư vấn',
  'muốn mua',
  'đầu tư',
  'xem nhà',
  'xem đất',
  'sổ đỏ',
  'pháp lý',
  'đặt cọc',
  'còn không',
  'gửi em',
  'cần mua',
];

const PRODUCT_KEYWORDS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /symphony/i, tag: 'sun' },
  { pattern: /s[\s-]?light/i, tag: 'sun' },
  { pattern: /fours?/i, tag: 'sun' },
  { pattern: /cora/i, tag: 'sun' },
  { pattern: /spana/i, tag: 'sun' },
  { pattern: /sun\s*group/i, tag: 'sun' },
  { pattern: /\bsun\b/i, tag: 'sun' },
  { pattern: /mai\s*đăng\s*chơn/i, tag: 'mai-dang-chon' },
  { pattern: /căn hộ/i, tag: 'apartment' },
  { pattern: /\bđất\b/i, tag: 'land' },
  { pattern: /nhà phố/i, tag: 'land' },
  { pattern: /shophouse/i, tag: 'apartment' },
];

function normalizeText(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function extractPhoneFromText(text?: string): string | null {
  if (!text) return null;
  const match = text.match(/(?:\+84|84|0)(?:[\s.-]?\d){8,10}/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, '');
  if (digits.length < 9) return null;
  if (digits.startsWith('84')) return `0${digits.slice(2)}`;
  return digits.startsWith('0') ? digits : `0${digits}`;
}

export function hasBudgetMention(text?: string): boolean {
  if (!text) return false;
  return /\d+(?:[.,]\d+)?\s*(?:tỷ|ty|tỉ|ti|tỷ)/i.test(text);
}

export function analyzeIntent(text?: string, sourceType: 'messenger' | 'comment' = 'comment'): IntentDetectionResult {
  if (!text?.trim()) {
    return {
      hasIntent: false,
      highIntent: false,
      tags: ['facebook', sourceType],
      score: 0,
      phone: null,
      hasBudget: false,
    };
  }

  const normalized = normalizeText(text);
  const tags = new Set<string>(['facebook', sourceType]);
  let score = 0;
  let highIntent = false;

  for (const keyword of HIGH_INTENT_KEYWORDS) {
    if (normalized.includes(normalizeText(keyword))) {
      highIntent = true;
      tags.add('hot-intent');
      score += 30;
      break;
    }
  }

  let hasProduct = false;
  for (const item of PRODUCT_KEYWORDS) {
    if (item.pattern.test(text)) {
      hasProduct = true;
      tags.add(item.tag);
    }
  }
  if (hasProduct) score += 20;

  const phone = extractPhoneFromText(text);
  if (phone) {
    tags.add('phone-present');
    score += 30;
  }

  const hasBudget = hasBudgetMention(text);
  if (hasBudget) {
    tags.add('budget-present');
    score += 20;
  }

  const hasIntent = highIntent || hasProduct || Boolean(phone) || hasBudget;

  return {
    hasIntent,
    highIntent,
    tags: Array.from(tags),
    score,
    phone,
    hasBudget,
  };
}

/** @deprecated use analyzeIntent */
export function detectCommentIntent(text?: string) {
  const result = analyzeIntent(text, 'comment');
  return {
    hasIntent: result.hasIntent,
    highIntent: result.highIntent,
    tags: result.tags,
    scoreBoost: result.score,
  };
}
