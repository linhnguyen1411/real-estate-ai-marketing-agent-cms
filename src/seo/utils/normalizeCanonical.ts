/**
 * Single place for absolute canonical URL normalization.
 * Preserves historical `siteConfig.absoluteUrl` behavior.
 */
export function normalizeCanonical(path: string, origin: string): string {
  if (!path) return origin.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(path)) return path;
  const base = origin.replace(/\/+$/, '');
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

/** Normalize pathname for registry lookup (`/foo/` → `/foo`, empty → `/`). */
export function normalizePathname(pathname: string): string {
  const raw = String(pathname || '').trim();
  if (!raw || raw === '/') return '/';
  return raw.replace(/\/+$/, '') || '/';
}
