/**
 * Money serialization helpers for Lead Intelligence DTOs.
 * Domain may use number/bigint; JSON DTO uses string VND integers or null.
 */

export type MoneyPeriod = 'one_time' | 'month' | 'year' | null;

export type MoneyRangeDTO = {
  minVnd: string | null;
  maxVnd: string | null;
  period: MoneyPeriod;
  qualifier: string | null;
  display: string | null;
  rawMentions: string[];
};

export function moneyToVndString(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.trunc(value).toString();
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^-?\d+$/.test(s)) return s;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n).toString() : null;
}

export function moneyRangeDTO(input: {
  min?: unknown;
  max?: unknown;
  period?: MoneyPeriod;
  qualifier?: string | null;
  display?: string | null;
  rawMentions?: string[];
}): MoneyRangeDTO {
  return {
    minVnd: moneyToVndString(input.min),
    maxVnd: moneyToVndString(input.max),
    period: input.period ?? null,
    qualifier: input.qualifier ?? null,
    display: input.display ?? null,
    rawMentions: Array.isArray(input.rawMentions) ? input.rawMentions.map(String) : [],
  };
}

export function emptyMoneyRange(): MoneyRangeDTO {
  return moneyRangeDTO({});
}
