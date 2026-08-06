export type BuildDescriptionOptions = {
  /** Optional max length — when set, truncates with `...` (existing SSR truncateMeta behavior). */
  maxLength?: number;
};

/**
 * Single entry for meta description generation.
 * Default: return trimmed description unchanged.
 */
export function buildDescription(
  description: string,
  options: BuildDescriptionOptions = {},
): string {
  const cleaned = String(description || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const maxLength = options.maxLength;
  if (maxLength == null || cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}
