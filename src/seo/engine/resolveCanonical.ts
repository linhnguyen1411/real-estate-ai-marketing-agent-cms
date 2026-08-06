import { SITE } from '../siteConfig';
import { normalizeCanonical, normalizePathname } from '../utils/normalizeCanonical';

export type ResolveCanonicalInput = {
  path: string;
  origin?: string;
};

/**
 * Canonical URL generation — single place only.
 */
export function resolveCanonical(input: ResolveCanonicalInput): string {
  const origin = (input.origin || SITE.url).replace(/\/+$/, '');
  const path = normalizePathname(input.path);
  if (path === '/') return normalizeCanonical('/', origin);
  return normalizeCanonical(path, origin);
}
