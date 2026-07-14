/**
 * Vietnamese price / budget extractor (VND).
 *
 * Deterministic. Recognizes tỷ / triệu / tr / k, ranges, monthly rent,
 * "thương lượng / thỏa thuận". Never treats area (m2), phone numbers or
 * house numbers as money. When context is ambiguous the type is `unknown`
 * so AI can enrich later without overwriting raw evidence.
 */

export const MONEY_EXTRACTOR_VERSION = 'money-1';

export type MoneyType = 'asking_price' | 'buyer_budget' | 'rent_price' | 'unknown';
export type MoneyPeriod = 'one_time' | 'month' | 'year' | null;

export interface ExtractedMoney {
  rawText: string;
  type: MoneyType;
  minAmountVnd: number | null;
  maxAmountVnd: number | null;
  currency: 'VND';
  period: MoneyPeriod;
  confidence: number;
  contextText: string;
  qualifier?: 'slightly_above' | 'above' | 'approx' | 'exact' | null;
  display?: string | null;
}

const TY = 1_000_000_000;
const TRIEU = 1_000_000;
const NGHIN = 1_000;

const BUDGET_HINTS = /(tài\s*chính|ngân\s*sách|tầm|khoảng|budget|có\s*sẵn|cần\s*mua|muốn\s*mua|đang\s*tìm)/i;
const ASK_HINTS = /(giá|bán|cần\s*bán|ra\s*giá|chỉ\s*còn|nhượng|sang\s*nhượng|nhỉnh|giá\s*chỉ|xxx)/i;
const RENT_HINTS = /(thuê|cho\s*thuê|\/\s*tháng|\/\s*th|mỗi\s*tháng)/i;

function toContext(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function parseNumber(value: string): number {
  // handle "3,5" and "3.5" (VN uses comma as decimal). Strip thousands sep.
  const cleaned = value.trim().replace(/\s+/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) {
    // grouped thousands e.g. 1.200 or 1,200
    return Number(cleaned.replace(/[.,]/g, ''));
  }
  return Number(cleaned.replace(',', '.'));
}

interface Amount {
  min: number;
  max: number;
}

/**
 * Parse a single amount expression (already unit-bearing) to VND.
 * Handles "4 tỷ 500" (=> 4.5 tỷ), "4 tỷ 5", "1 tỷ 200 triệu", "950 triệu".
 */
function parseAmountExpr(expr: string): number | null {
  const lower = expr.toLowerCase();

  const tyMatch = lower.match(/([\d.,]+)\s*t[yỷ]/);
  if (tyMatch) {
    let total = parseNumber(tyMatch[1]) * TY;
    // trailing remainder after tỷ: "4 tỷ 500" (=> +500 triệu) or "4 tỷ 5" (=> +500 triệu)
    const after = lower.slice((tyMatch.index ?? 0) + tyMatch[0].length);
    const remMatch = after.match(/^\s*([\d.,]+)\s*(triệu|tr)?/);
    if (remMatch && remMatch[1]) {
      const n = parseNumber(remMatch[1]);
      if (remMatch[2]) {
        total += n * TRIEU; // explicit "triệu"
      } else {
        // "4 tỷ 5" => 5*100 triệu ; "4 tỷ 500" => 500 triệu
        total += (n < 10 ? n * 100 : n) * TRIEU;
      }
    }
    return total;
  }

  const trieuMatch = lower.match(/([\d.,]+)\s*(triệu|tr)/);
  if (trieuMatch) return parseNumber(trieuMatch[1]) * TRIEU;

  const kMatch = lower.match(/([\d.,]+)\s*(k|nghìn|ngàn)/);
  if (kMatch) return parseNumber(kMatch[1]) * NGHIN;

  return null;
}

function classifyType(context: string, period: MoneyPeriod): MoneyType {
  if (period === 'month' || RENT_HINTS.test(context)) return 'rent_price';
  if (BUDGET_HINTS.test(context)) return 'buyer_budget';
  if (ASK_HINTS.test(context)) return 'asking_price';
  return 'unknown';
}

// range: "3-4 tỷ", "3 đến 4 tỷ", "3 tới 4 tỷ"
const RANGE_RE = /([\d.,]+)\s*(?:-|–|đến|tới|~)\s*([\d.,]+)\s*(t[yỷ]|triệu|tr)(?![\p{L}])/giu;
// single with unit, possibly with tỷ+remainder: capture greedily unit phrase
const SINGLE_RE = /([\d.,]+\s*t[yỷ](?:\s*[\d.,]+\s*(?:triệu|tr)?)?|[\d.,]+\s*(?:triệu|tr|k|nghìn|ngàn))(?![\p{L}])/giu;
const BOUND_RE = /(dưới|trên|từ|tối\s*đa|tối\s*thiểu)\s+([\d.,]+\s*(?:t[yỷ]|triệu|tr|k))(?![\p{L}])/giu;
const SLIGHTLY_ABOVE_RE =
  /(?:nhỉnh|hơn|trên|khoảng|tầm)\s+([\d.,]+\s*(?:t[yỷ]|triệu|tr))(?![\p{L}])|([\d.,]+\s*t[yỷ])\s*(?:hơn|xxx|xx)\b/giu;
const NEGOTIABLE_RE = /(thương\s*lượng|thỏa\s*thuận|thoả\s*thuận|thoả\s*thuan|giá\s*tốt)/i;

function moneyDisplay(
  amount: number | null,
  qualifier: ExtractedMoney['qualifier'],
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const ty = amount / TY;
  const body =
    amount >= TY
      ? `${ty % 1 === 0 ? ty.toFixed(0) : ty.toFixed(1)} tỷ`
      : `${Math.round(amount / TRIEU)} triệu`;
  if (qualifier === 'slightly_above' || qualifier === 'above') return `Trên ${body}`;
  if (qualifier === 'approx') return `Khoảng ${body}`;
  return body;
}

export function extractMoney(text: string): ExtractedMoney[] {
  if (!text) return [];
  const results: ExtractedMoney[] = [];
  const consumed: Array<[number, number]> = [];

  const overlaps = (start: number, end: number) =>
    consumed.some(([s, e]) => start < e && end > s);

  // 0) nhỉnh / hơn / trên / 3 tỷ xxx
  for (const m of text.matchAll(SLIGHTLY_ABOVE_RE)) {
    const idx = m.index ?? 0;
    if (overlaps(idx, idx + m[0].length)) continue;
    const expr = (m[1] || m[2] || '').trim();
    const amount = parseAmountExpr(expr);
    if (amount == null) continue;
    const context = toContext(text, idx, m[0].length);
    const period: MoneyPeriod = RENT_HINTS.test(context) ? 'month' : 'one_time';
    const qualifier: ExtractedMoney['qualifier'] = /khoảng|tầm/i.test(m[0])
      ? 'approx'
      : /nhỉnh/i.test(m[0])
        ? 'slightly_above'
        : 'above';
    consumed.push([idx, idx + m[0].length]);
    results.push({
      rawText: m[0].trim(),
      type: classifyType(`${context} nhỉnh giá`, period) === 'buyer_budget' && !ASK_HINTS.test(context)
        ? 'asking_price'
        : ASK_HINTS.test(context) || /nhỉnh|hơn|xxx|có\s*lô|xem\s*đất|diện\s*tích/i.test(context)
          ? 'asking_price'
          : classifyType(context, period),
      minAmountVnd: amount,
      maxAmountVnd: null,
      currency: 'VND',
      period,
      confidence: 0.88,
      contextText: context,
      qualifier,
      display: moneyDisplay(amount, qualifier),
    });
  }

  // 1) ranges first (most specific)
  for (const m of text.matchAll(RANGE_RE)) {
    const idx = m.index ?? 0;
    if (overlaps(idx, idx + m[0].length)) continue;
    const unit = m[3].toLowerCase();
    const mult = /t[yỷ]/.test(unit) ? TY : TRIEU;
    const min = parseNumber(m[1]) * mult;
    const max = parseNumber(m[2]) * mult;
    const context = toContext(text, idx, m[0].length);
    const period: MoneyPeriod = RENT_HINTS.test(context) ? 'month' : 'one_time';
    consumed.push([idx, idx + m[0].length]);
    results.push({
      rawText: m[0].trim(),
      type: classifyType(context, period),
      minAmountVnd: Math.min(min, max),
      maxAmountVnd: Math.max(min, max),
      currency: 'VND',
      period,
      confidence: 0.85,
      contextText: context,
      qualifier: 'exact',
      display: moneyDisplay(Math.min(min, max), 'exact'),
    });
  }

  // 2) bounded ("dưới 5 tỷ", "trên 10 tỷ")
  for (const m of text.matchAll(BOUND_RE)) {
    const idx = m.index ?? 0;
    if (overlaps(idx, idx + m[0].length)) continue;
    const amount = parseAmountExpr(m[2]);
    if (amount == null) continue;
    const bound = m[1].toLowerCase();
    const context = toContext(text, idx, m[0].length);
    const period: MoneyPeriod = RENT_HINTS.test(context) ? 'month' : 'one_time';
    const isMax = /dưới|tối\s*đa/.test(bound);
    const qualifier: ExtractedMoney['qualifier'] = /trên/i.test(bound) ? 'above' : 'exact';
    consumed.push([idx, idx + m[0].length]);
    results.push({
      rawText: m[0].trim(),
      type: classifyType(context, period),
      minAmountVnd: isMax ? null : amount,
      maxAmountVnd: isMax ? amount : null,
      currency: 'VND',
      period,
      confidence: 0.8,
      contextText: context,
      qualifier,
      display: moneyDisplay(amount, qualifier),
    });
  }

  // 3) single amounts
  for (const m of text.matchAll(SINGLE_RE)) {
    const idx = m.index ?? 0;
    if (overlaps(idx, idx + m[0].length)) continue;
    const amount = parseAmountExpr(m[1]);
    if (amount == null || amount <= 0) continue;
    const context = toContext(text, idx, m[0].length);
    const period: MoneyPeriod = RENT_HINTS.test(context) ? 'month' : null;
    consumed.push([idx, idx + m[0].length]);
    results.push({
      rawText: m[1].trim(),
      type: classifyType(context, period ?? 'one_time'),
      minAmountVnd: amount,
      maxAmountVnd: amount,
      currency: 'VND',
      period: period ?? 'one_time',
      confidence: 0.75,
      contextText: context,
      qualifier: 'exact',
      display: moneyDisplay(amount, 'exact'),
    });
  }

  // 4) negotiable (only when no numeric amount found)
  if (results.length === 0 && NEGOTIABLE_RE.test(text)) {
    const m = text.match(NEGOTIABLE_RE)!;
    results.push({
      rawText: m[0].trim(),
      type: 'unknown',
      minAmountVnd: null,
      maxAmountVnd: null,
      currency: 'VND',
      period: null,
      confidence: 0.5,
      contextText: toContext(text, m.index ?? 0, m[0].length),
      qualifier: null,
      display: null,
    });
  }

  return results;
}

export interface MoneyExtractionResult {
  money: ExtractedMoney[];
  askingPrice: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  rentPrice: number | null;
  version: string;
}

export function extractMoneyData(text: string): MoneyExtractionResult {
  const money = extractMoney(text);
  let askingPrice: number | null = null;
  let budgetMin: number | null = null;
  let budgetMax: number | null = null;
  let rentPrice: number | null = null;

  for (const m of money) {
    if (m.type === 'asking_price' && askingPrice == null) askingPrice = m.minAmountVnd ?? m.maxAmountVnd;
    if (m.type === 'buyer_budget') {
      if (m.minAmountVnd != null) budgetMin = budgetMin == null ? m.minAmountVnd : Math.min(budgetMin, m.minAmountVnd);
      if (m.maxAmountVnd != null) budgetMax = budgetMax == null ? m.maxAmountVnd : Math.max(budgetMax, m.maxAmountVnd);
    }
    if (m.type === 'rent_price' && rentPrice == null) rentPrice = m.minAmountVnd ?? m.maxAmountVnd;
  }

  if (askingPrice == null) {
    const listingAsk = money.find(
      m =>
        (m.type === 'asking_price' || m.type === 'unknown') &&
        (m.minAmountVnd != null || m.maxAmountVnd != null) &&
        /nhỉnh|giá\s*chỉ|xxx|ngang|dt\s*[\d.,]|có\s*lô|xem\s*đất|hơn|trên/i.test(m.contextText + m.rawText),
    );
    if (listingAsk) {
      askingPrice = listingAsk.minAmountVnd ?? listingAsk.maxAmountVnd;
    }
  }

  return { money, askingPrice, budgetMin, budgetMax, rentPrice, version: MONEY_EXTRACTOR_VERSION };
}
