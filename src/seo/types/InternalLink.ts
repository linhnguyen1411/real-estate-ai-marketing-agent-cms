/**
 * Directed relationship between SEO pages (graph edge).
 * No HTML — structure only.
 */
export type InternalLinkRelation =
  | 'parent'
  | 'children'
  | 'related'
  | 'comparison'
  | 'financial'
  | 'location'
  | 'project'
  | 'article';

export interface InternalLinkEdge {
  fromSlug: string;
  toSlug: string;
  relation: InternalLinkRelation;
  label?: string;
  weight?: number;
}

export interface InternalLinkNode {
  slug: string;
  label: string;
  parentSlug?: string;
  childSlugs?: string[];
  relatedSlugs?: string[];
  comparisonSlugs?: string[];
  financialSlugs?: string[];
  locationSlugs?: string[];
  projectSlugs?: string[];
  articleSlugs?: string[];
}
