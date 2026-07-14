/**
 * Small runtime validators / normalizers for Lead Intelligence.
 * No Zod dependency — keep R1 lightweight.
 */

export function normalizeNullableString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

export function normalizeNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

export type LeadIntelligenceValidationResult = {
  ok: boolean;
  warnings: string[];
};

export function validateLeadIntelligenceDTO(value: unknown): LeadIntelligenceValidationResult {
  const warnings: string[] = [];
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, warnings: ['intelligence_not_object'] };
  }
  const v = value as Record<string, unknown>;
  if (!('classification' in v)) warnings.push('missing_classification');
  if (!('contact' in v)) warnings.push('missing_contact');
  if (!('scoreStatus' in v) && !('finalScore' in v)) warnings.push('missing_score');
  if (v.primaryPhone != null && typeof v.primaryPhone === 'object') {
    warnings.push('primary_phone_is_object');
  }
  return { ok: warnings.length === 0, warnings };
}
