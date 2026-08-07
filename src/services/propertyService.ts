import type { Property } from '../types';
import {
  isSunGroupPortfolioSlug,
  matchesPortfolioProject,
} from '../seo/portfolioPropertyMatch';

export type PublicPropertiesResponse = {
  status: string;
  data: Property[];
  meta?: { projectDisplayOrder?: string[] };
};

/**
 * Fetch public properties, optionally scoped to a portfolio / project slug.
 * Parent Sun Group slug expands to all child projects server-side.
 */
export async function fetchPublicProperties(options?: {
  portfolioSlug?: string | null;
  signal?: AbortSignal;
}): Promise<Property[]> {
  const params = new URLSearchParams();
  const slug = String(options?.portfolioSlug || '').trim();
  if (slug) {
    params.set('portfolio', slug);
    // Back-compat aliases some clients may send
    params.set('projectSlug', slug);
  }
  const qs = params.toString();
  const url = qs ? `/api/public/properties?${qs}` : '/api/public/properties';
  const response = await fetch(url, { signal: options?.signal });
  if (!response.ok) {
    throw new Error(`Failed to load properties (${response.status})`);
  }
  const json = (await response.json()) as PublicPropertiesResponse;
  const list = Array.isArray(json.data) ? json.data : [];

  // Client-side safety net if an older API ignores portfolio=
  if (slug) {
    return list.filter(property => matchesPortfolioProject(property, slug));
  }
  return list;
}

export function filterPropertiesForPortfolio(
  properties: Property[],
  portfolioSlug: string | null | undefined,
): Property[] {
  const slug = String(portfolioSlug || '').trim();
  if (!slug) return properties;
  return properties.filter(property => matchesPortfolioProject(property, slug));
}

export function isSunGroupPortfolioPage(slug: string | null | undefined): boolean {
  return isSunGroupPortfolioSlug(slug);
}
