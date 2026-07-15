/**
 * Phone helpers for spam policy — reuses extractor normalize semantics.
 */
import { extractPhones, normalizeVietnamPhone } from '../extractors/phoneExtractor';

export interface NormalizedSpamPhone {
  rawValue: string;
  normalizedValue: string;
  e164Value: string;
  valid: boolean;
}

export function normalizeSpamPhoneInput(raw: string): NormalizedSpamPhone | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const normalized = normalizeVietnamPhone(trimmed);
  if (!normalized) return null;
  return {
    rawValue: trimmed,
    normalizedValue: normalized.normalized,
    e164Value: normalized.e164,
    valid: normalized.valid,
  };
}

export function phonesMatch(
  contentPhone: { normalized?: string; e164?: string; raw?: string },
  rule: { normalizedValue?: string | null; e164Value?: string | null; rawValue?: string },
): boolean {
  const cNorm = contentPhone.normalized || normalizeVietnamPhone(contentPhone.raw || '')?.normalized;
  const cE164 = contentPhone.e164 || normalizeVietnamPhone(contentPhone.raw || '')?.e164;
  const rNorm = rule.normalizedValue || normalizeVietnamPhone(rule.rawValue || '')?.normalized;
  const rE164 = rule.e164Value || normalizeVietnamPhone(rule.rawValue || '')?.e164;
  if (cNorm && rNorm && cNorm === rNorm) return true;
  if (cE164 && rE164 && cE164 === rE164) return true;
  return false;
}

/** Extract candidate phone strings from free text for policy evaluation. */
export function collectPhonesFromText(text: string): Array<{ raw: string; normalized: string; e164: string }> {
  return extractPhones(text || '').map(p => ({
    raw: p.raw,
    normalized: p.normalized,
    e164: p.e164,
  }));
}
