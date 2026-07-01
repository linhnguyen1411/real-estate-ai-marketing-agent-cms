import { Property } from '../types';

export function getPropertyCreatorId(property: Property): string | undefined {
  return property.created_by_user_id || property.owner_user_id;
}

export function getPropertyCreatorName(
  property: Property,
  namesById: Map<string, string>,
): string {
  const creatorId = getPropertyCreatorId(property);
  if (!creatorId) return '—';
  return namesById.get(creatorId) || creatorId;
}
