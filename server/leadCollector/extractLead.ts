import type { LeadIntent } from '../../src/types';
import {
  computeExtractConfidence,
  extractVietnamPhones
} from '../lib/extractVietnamPhones';
import { classifyLeadIntent, computeLeadScore, intentLabel } from '../crawler/leadExtractor';

export type PropertyTypeOption =
  | 'Đất nền'
  | 'Nhà Phố'
  | 'Căn Hộ'
  | 'Shophouse'
  | 'Kho xưởng'
  | 'Nhà hàng'
  | 'Khách sạn'
  | 'Biệt thự'
  | 'Villa'
  | 'Khác';

const PROPERTY_TYPE_RULES: Array<{ type: PropertyTypeOption; keywords: string[] }> = [
  { type: 'Đất nền', keywords: ['dat nen', 'lo dat', 'ban dat', 'dat tho cu', 'dat du an', 'dat nen du an'] },
  { type: 'Nhà Phố', keywords: ['nha pho', 'nha mat tien', 'nha rieng', 'nha cap 4'] },
  { type: 'Căn Hộ', keywords: ['can ho', 'chung cu', 'apartment', 'studio'] },
  { type: 'Shophouse', keywords: ['shophouse', 'shop house', 'mat bang kinh doanh', 'nha pho thuong mai'] },
  { type: 'Kho xưởng', keywords: ['kho xuong', 'nha xuong', 'xuong san xuat', 'kho bai'] },
  { type: 'Nhà hàng', keywords: ['nha hang', 'sang nhuong nha hang', 'quan an'] },
  { type: 'Khách sạn', keywords: ['khach san', 'hotel', 'homestay', 'resort'] },
  { type: 'Biệt thự', keywords: ['biet thu', 'villa', 'biet thu don lap'] }
];

const LOCATION_KEYWORDS = [
  'hoa xuan', 'hoa quy', 'cam le', 'ngu hanh son', 'son tra', 'lien chieu', 'thanh khe',
  'hai chau', 'nam da nang', 'bac da nang', 'dien ban', 'hoi an', 'da nang', 'my khe',
  'an thuong', 'hoa hai', 'hoa chau', 'xuan ha', 'hoa phat', 'hoa khanh', 'hoa cuong'
];

function stripDiacritics(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function extractBudgetFromText(text: string): number {
  const normalized = stripDiacritics(text);
  const mixed = normalized.match(/(\d+)\s*(?:ty|ti)\s*(\d+)/);
  if (mixed) return Number(`${mixed[1]}.${mixed[2]}`);

  const billion = [...normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*(ty|ti|tys|billion)/g)]
    .map(m => Number(m[1].replace(',', '.')))
    .filter(v => Number.isFinite(v) && v > 0);
  if (billion.length) return Math.max(...billion);

  const million = [...normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*(trieu|tr)\b/g)]
    .map(m => Number(m[1].replace(',', '.')) / 1000)
    .filter(v => Number.isFinite(v) && v > 0);
  if (million.length) return Math.max(...million);

  return 0;
}

export function extractPropertyType(text: string): PropertyTypeOption {
  const normalized = stripDiacritics(text);
  let best: { type: PropertyTypeOption; score: number } = { type: 'Khác', score: 0 };

  PROPERTY_TYPE_RULES.forEach(rule => {
    const score = rule.keywords.reduce((sum, kw) => sum + (normalized.includes(kw) ? 1 : 0), 0);
    if (score > best.score) best = { type: rule.type, score };
  });

  return best.type;
}

export function extractLocation(text: string): string {
  const normalized = stripDiacritics(text);
  const hits = LOCATION_KEYWORDS.filter(kw => normalized.includes(kw));
  if (!hits.length) return 'Đà Nẵng';

  const labels: Record<string, string> = {
    'hoa xuan': 'Hòa Xuân, Cẩm Lệ',
    'hoa quy': 'Hòa Quý, Ngũ Hành Sơn',
    'cam le': 'Cẩm Lệ',
    'ngu hanh son': 'Ngũ Hành Sơn',
    'son tra': 'Sơn Trà',
    'lien chieu': 'Liên Chiểu',
    'thanh khe': 'Thanh Khê',
    'hai chau': 'Hải Châu',
    'nam da nang': 'Nam Đà Nẵng',
    'bac da nang': 'Bắc Đà Nẵng',
    'my khe': 'Mỹ Khê, Sơn Trà',
    'da nang': 'Đà Nẵng'
  };

  for (const hit of hits) {
    if (labels[hit]) return labels[hit];
  }
  return 'Đà Nẵng';
}

export function buildLeadAiSummary(input: {
  demand_type: LeadIntent;
  property_type: string;
  location: string;
  budget: number;
  phone?: string;
  phones?: string[];
  possible_phones?: string[];
  text: string;
}) {
  const parts = [
    `[Semi-auto] ${intentLabel(input.demand_type)}`,
    input.property_type !== 'Khác' ? input.property_type : '',
    input.location,
    input.budget > 0 ? `~${input.budget} tỷ` : '',
    input.phone ? `SĐT: ${input.phone}` : '',
    input.phones && input.phones.length > 1 ? `(+${input.phones.length - 1} SĐT khác)` : '',
    input.possible_phones?.length ? `(possible: ${input.possible_phones.slice(0, 2).join(', ')})` : ''
  ].filter(Boolean);

  const snippet = normalizeWhitespace(input.text).slice(0, 280);
  return `${parts.join(' · ')}${snippet ? ` — ${snippet}` : ''}`;
}

export interface LeadExtractInput {
  title?: string;
  url?: string;
  raw_content?: string;
  selected_text?: string;
}

export interface LeadExtractResult {
  title: string;
  url: string;
  raw_content: string;
  selected_text: string;
  phone: string;
  phones: string[];
  possible_phones: string[];
  raw_phone_matches: string[];
  confidence_score: number;
  demand_type: LeadIntent;
  property_type: PropertyTypeOption;
  location: string;
  budget: number;
  ai_summary: string;
  lead_score: number;
  name: string;
}

export function extractLeadFromContent(input: LeadExtractInput): LeadExtractResult {
  const title = normalizeWhitespace(input.title || '');
  const url = normalizeWhitespace(input.url || '');
  const rawContent = normalizeWhitespace(input.raw_content || '');
  const selectedText = normalizeWhitespace(input.selected_text || '');
  const primaryText = selectedText || rawContent || title;
  const scanText = `${primaryText}\n${rawContent}`;

  const phoneResult = extractVietnamPhones(scanText);
  const phones = phoneResult.validPhones;
  const possible_phones = phoneResult.possiblePhones;
  const phone = phones[0] || '';
  const confidence_score = computeExtractConfidence(scanText, phoneResult);

  const demand_type = classifyLeadIntent(primaryText);
  const property_type = extractPropertyType(primaryText);
  const location = extractLocation(primaryText);
  const budget = extractBudgetFromText(primaryText);
  const ai_summary = buildLeadAiSummary({
    demand_type,
    property_type,
    location,
    budget,
    phone,
    phones,
    possible_phones,
    text: primaryText
  });
  const lead_score = computeLeadScore(demand_type, Boolean(phone), confidence_score);
  const name = title.slice(0, 80) || `Lead ${intentLabel(demand_type)} ${location}`.slice(0, 80);

  return {
    title,
    url,
    raw_content: rawContent.slice(0, 12000),
    selected_text: selectedText.slice(0, 8000),
    phone,
    phones,
    possible_phones,
    raw_phone_matches: phoneResult.rawMatches,
    confidence_score,
    demand_type,
    property_type,
    location,
    budget,
    ai_summary,
    lead_score,
    name
  };
}

export function splitBulkLeadText(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const bySeparator = normalized.split(/\n\s*[-—=]{3,}\s*\n|\n{3,}/).map(s => s.trim()).filter(s => s.length >= 30);
  if (bySeparator.length > 1) return bySeparator;

  const byPhoneBlocks = normalized.split(/(?=\b(?:\+?84|0)\s*(?:3|5|7|8|9))/).map(s => s.trim()).filter(s => s.length >= 30);
  if (byPhoneBlocks.length > 1) return byPhoneBlocks;

  return [normalized];
}
