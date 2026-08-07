import type { PageType } from './PageType';

export type EntityType =
  | 'brand'
  | 'developer'
  | 'project'
  | 'tower'
  | 'location'
  | 'zone'
  | 'segment'
  | 'product';

/**
 * Canonical SEO entity — knowledge graph node (no rendering).
 */
export interface Entity {
  id: string;
  slug: string;
  name: string;
  entityType: EntityType;
  parentId?: string;
  childIds?: string[];
  aliases?: string[];
  locationId?: string;
  projectId?: string;
  relatedEntityIds?: string[];
  /** Optional default page association */
  primaryPageSlug?: string;
  pageTypes?: PageType[];
}
