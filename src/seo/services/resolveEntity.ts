import type { Entity } from '../types/Entity';
import {
  getEntityRecord,
  getEntityRecordBySlug,
  listEntityRecords,
} from '../data/entities';

export type ResolveEntityInput = {
  id?: string;
  slug?: string;
  /** Include parent / children / related when present */
  expand?: boolean;
};

export type ResolvedEntity = Entity & {
  parent?: Entity;
  children?: Entity[];
  related?: Entity[];
  location?: Entity;
  project?: Entity;
};

/**
 * Pure entity resolver — no I/O.
 */
export function resolveEntity(input: ResolveEntityInput): ResolvedEntity | undefined {
  const base = input.id
    ? getEntityRecord(input.id)
    : input.slug
      ? getEntityRecordBySlug(input.slug)
      : undefined;
  if (!base) return undefined;

  if (!input.expand) return { ...base };

  return {
    ...base,
    parent: base.parentId ? getEntityRecord(base.parentId) : undefined,
    children: (base.childIds || []).map(getEntityRecord).filter(Boolean) as Entity[],
    related: (base.relatedEntityIds || []).map(getEntityRecord).filter(Boolean) as Entity[],
    location: base.locationId ? getEntityRecord(base.locationId) : undefined,
    project: base.projectId ? getEntityRecord(base.projectId) : undefined,
  };
}

export function resolveAllEntities(): readonly Entity[] {
  return listEntityRecords();
}
