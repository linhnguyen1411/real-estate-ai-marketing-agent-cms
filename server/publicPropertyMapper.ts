import type { Property } from '../src/types';
import { stripPropertyImagesForApi } from '../src/utils/propertyImage';

export function toPublicPropertySummary(property: Property): Property {
  return stripPropertyImagesForApi(property);
}

export function filterPublicProperties(properties: Property[]): Property[] {
  return properties
    .filter(property => !['sold', 'hidden'].includes(property.sale_status || 'available'))
    .map(toPublicPropertySummary);
}
