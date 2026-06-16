import type { LeadIntent } from '../../src/types';

const BUY_KEYWORDS = ['can mua', 'mua nha', 'mua dat', 'mua can ho', 'tim mua', 'can tim mua', 'dang tim mua'];
const SELL_KEYWORDS = ['can ban', 'ban nha', 'ban dat', 'ban can ho', 'dang ban', 'can thanh ly', 'chuyen nhuong'];
const RENT_KEYWORDS = ['can thue', 'thue nha', 'thue van phong', 'thue mat bang', 'tim thue', 'can thue nha'];
const LEASE_KEYWORDS = ['cho thue', 'dang cho thue', 'cho thue nha', 'cho thue van phong', 'cho thue mat bang'];

function stripDiacritics(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

export function classifyLeadIntent(text: string): LeadIntent {
  const normalized = stripDiacritics(text);

  const scores: Record<LeadIntent, number> = {
    buy: 0,
    sell: 0,
    rent: 0,
    lease: 0,
    unknown: 0
  };

  BUY_KEYWORDS.forEach(kw => { if (normalized.includes(kw)) scores.buy += 2; });
  SELL_KEYWORDS.forEach(kw => { if (normalized.includes(kw)) scores.sell += 2; });
  RENT_KEYWORDS.forEach(kw => { if (normalized.includes(kw)) scores.rent += 2; });
  LEASE_KEYWORDS.forEach(kw => { if (normalized.includes(kw)) scores.lease += 2; });

  if (normalized.includes('mua') && !normalized.includes('ban')) scores.buy += 1;
  if (normalized.includes('ban') && !normalized.includes('mua')) scores.sell += 1;
  if (normalized.includes('thue') && !normalized.includes('cho thue')) scores.rent += 1;

  const ranked = (Object.entries(scores) as [LeadIntent, number][])
    .filter(([intent]) => intent !== 'unknown')
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length || ranked[0][1] === 0) return 'unknown';
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return 'unknown';
  return ranked[0][0];
}

export function intentLabel(intent: LeadIntent) {
  const labels: Record<LeadIntent, string> = {
    buy: 'Mua',
    sell: 'Bán',
    rent: 'Thuê',
    lease: 'Cho thuê',
    unknown: 'Chưa rõ'
  };
  return labels[intent];
}

export function computeLeadScore(intent: LeadIntent, hasPhone: boolean, phoneConfidence = 0) {
  let score = hasPhone ? 45 : 25;
  if (phoneConfidence > 0) score += Math.min(20, phoneConfidence);
  if (intent === 'buy' || intent === 'sell') score += 20;
  else if (intent === 'rent' || intent === 'lease') score += 15;
  return Math.min(score, 95);
}
