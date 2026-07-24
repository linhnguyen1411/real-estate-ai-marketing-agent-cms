/**
 * Phase 1 — Normalization (no AI).
 */

export function normalizeLeadText(input: string): string {
  let text = String(input || '');

  // Remove URLs
  text = text.replace(/https?:\/\/\S+/gi, ' ');
  text = text.replace(/www\.\S+/gi, ' ');

  // Remove emoji / pictographs
  text = text.replace(/\p{Extended_Pictographic}/gu, ' ');
  text = text.replace(/[\u{1F000}-\u{1FAFF}]/gu, ' ');

  // Phone formatting → digits only clusters kept as digits with spaces
  text = text.replace(/(\+?\d[\d.\-\s()]{7,}\d)/g, m => m.replace(/\D/g, ' '));

  // Lowercase + NFC
  text = text.normalize('NFC').toLowerCase();

  // Collapse Vietnamese elongated chars: cầnnnn → cần, muaaaaa → mua
  text = text.replace(/(\p{L})\1{2,}/gu, '$1$1');
  // Then collapse remaining double-letter spam beyond 1 for short tokens? Spec: "cầnnnnnnnn muaaaaa" → "cần mua"
  text = text.replace(/(\p{L})\1+/gu, '$1');

  // Remove punctuation noise (keep letters/numbers/spaces)
  text = text.replace(/[^\p{L}\p{N}\s]/gu, ' ');

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/** Stable content hash for cache reuse */
export function hashNormalizedText(normalized: string): string {
  const s = String(normalized || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}
