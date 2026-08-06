export type BuildTitleOptions = {
  /**
   * When true, append ` | Estoria` if missing (matches historical `formatPageTitle`).
   * SSR / share-meta paths pass false to preserve exact historical titles.
   */
  appendBrand?: boolean;
  brand?: string;
};

/**
 * Single entry for page title generation.
 * Default: return trimmed title unchanged (no behavior change for SSR/share callers).
 */
export function buildTitle(title: string, options: BuildTitleOptions = {}): string {
  const trimmed = String(title || '').trim();
  if (!trimmed) return '';

  if (!options.appendBrand) return trimmed;

  const brand = options.brand || 'Estoria';
  const brandSuffix = new RegExp(`\\|\\s*${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  if (brandSuffix.test(trimmed)) return trimmed;
  return `${trimmed} | ${brand}`;
}
