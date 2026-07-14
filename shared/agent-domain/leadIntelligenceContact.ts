/**
 * Canonical phone types + helpers.
 */

export type LeadPhone = {
  raw: string | null;
  normalized: string | null;
  e164: string | null;
  label: string | null;
  contactName: string | null;
  source: string | null;
  confidence: number | null;
};

export type LeadIntelligenceContact = {
  primaryPhone: string | null;
  primaryPhoneDetail: LeadPhone | null;
  phones: LeadPhone[];
  emails: string[];
  zalo: string | null;
  confidence: number | null;
};

export function emptyLeadPhone(): LeadPhone {
  return {
    raw: null,
    normalized: null,
    e164: null,
    label: null,
    contactName: null,
    source: null,
    confidence: null,
  };
}

/** Coerce legacy string | object phone into LeadPhone */
export function coerceLeadPhone(value: unknown, source = 'unknown'): LeadPhone {
  if (value == null || value === '') {
    return emptyLeadPhone();
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    const normalized = raw.replace(/\D/g, '') || null;
    return {
      raw: raw || null,
      normalized,
      e164: null,
      label: null,
      contactName: null,
      source,
      confidence: null,
    };
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const raw = o.raw != null ? String(o.raw).trim() : o.normalized != null ? String(o.normalized).trim() : '';
    const normalized =
      o.normalized != null
        ? String(o.normalized).replace(/\D/g, '')
        : raw.replace(/\D/g, '');
    return {
      raw: raw || null,
      normalized: normalized || null,
      e164: o.e164 != null ? String(o.e164) : null,
      label: o.label != null ? String(o.label) : null,
      contactName: o.contactName != null ? String(o.contactName) : null,
      source: o.source != null ? String(o.source) : source,
      confidence: typeof o.confidence === 'number' ? o.confidence : null,
    };
  }
  return emptyLeadPhone();
}

export function resolvePrimaryPhone(
  primary: unknown,
  phones: unknown,
): { primaryPhone: string | null; primaryPhoneDetail: LeadPhone | null; phones: LeadPhone[]; legacyFallbacksUsed: string[] } {
  const legacyFallbacksUsed: string[] = [];
  const list: LeadPhone[] = [];

  if (Array.isArray(phones)) {
    for (const p of phones) {
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        legacyFallbacksUsed.push('legacy_phone_object');
      }
      const phone = coerceLeadPhone(p, 'extracted');
      if (phone.normalized || phone.raw) list.push(phone);
    }
  }

  let detail: LeadPhone | null = null;
  if (primary != null && typeof primary === 'object' && !Array.isArray(primary)) {
    legacyFallbacksUsed.push('legacy_primary_phone_object');
    detail = coerceLeadPhone(primary, 'primary');
  } else if (typeof primary === 'string' && primary.trim()) {
    detail = coerceLeadPhone(primary, 'primary');
  } else if (list[0]) {
    detail = list[0];
  }

  const primaryPhone = detail?.normalized || detail?.raw || null;
  if (detail && !list.some((p) => p.normalized === detail!.normalized && p.raw === detail!.raw)) {
    list.unshift(detail);
  }

  return {
    primaryPhone,
    primaryPhoneDetail: detail,
    phones: list,
    legacyFallbacksUsed: [...new Set(legacyFallbacksUsed)],
  };
}

/** Display helper — prefer importing formatVietnamPhoneDisplay from resolveLeadIntelligence / index. */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 11 && digits.startsWith('84')) {
    const local = `0${digits.slice(2)}`;
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return String(phone).trim();
}
