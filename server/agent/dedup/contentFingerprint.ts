/**
 * Lightweight near-duplicate fingerprint (token shingles + 64-bit simhash).
 * No AI calls.
 */

const STOP = new Set([
  'và', 'của', 'cho', 'các', 'một', 'những', 'là', 'có', 'được', 'với', 'tại',
  'the', 'and', 'for', 'with', 'this', 'that',
]);

function tokenize(normalized: string): string[] {
  return normalized
    .split(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+/i)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOP.has(t));
}

function fnv1a(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 16 hex chars representing a 64-bit simhash over 3-gram shingles. */
export function computeNearDuplicateFingerprint(normalized: string): string {
  const tokens = tokenize(normalized);
  if (tokens.length === 0) return '0'.repeat(16);

  const shingles: string[] = [];
  if (tokens.length < 3) {
    shingles.push(tokens.join(' '));
  } else {
    for (let i = 0; i <= tokens.length - 3; i++) {
      shingles.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
  }

  const bits = new Array<number>(64).fill(0);
  for (const shingle of shingles) {
    const h = fnv1a(shingle);
    const h2 = fnv1a(`~${shingle}`);
    for (let b = 0; b < 32; b++) {
      bits[b] += (h >>> b) & 1 ? 1 : -1;
      bits[b + 32] += (h2 >>> b) & 1 ? 1 : -1;
    }
  }

  let hi = 0;
  let lo = 0;
  for (let b = 0; b < 32; b++) {
    if (bits[b] >= 0) lo |= 1 << b;
    if (bits[b + 32] >= 0) hi |= 1 << b;
  }

  return ((hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0'));
}

export function hammingSimilarity(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 0;
  let xa = 0;
  let xb = 0;
  try {
    xa = parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16);
    xb = parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16);
  } catch {
    return 0;
  }
  const pop = (n: number) => {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24;
  };
  const distance = pop(xa >>> 0) + pop(xb >>> 0);
  return 1 - distance / 64;
}
