import type { Property } from '../../../src/types';
import {
  getPublicPropertySlug,
  slugifyProperty,
} from '../../../src/utils/propertyShare';

export const publicListingsPath = '/';

export const slugify = slugifyProperty;

export function getPropertySlug(property: Property) {
  return getPublicPropertySlug(property);
}

export function getPropertyPath(property: Property) {
  return `/${encodeURIComponent(getPropertySlug(property))}`;
}
