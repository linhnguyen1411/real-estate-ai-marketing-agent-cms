import { Property } from '../types';
import { getPropertyThumbnailUrl } from './propertyImage';
import { getPublicPropertySlug } from './propertyShare';

export function formatPrice(price: number) {
  return `${price.toLocaleString('vi-VN')} tỷ`;
}

export function getPropertyViewCount(property: Property) {
  return Number(property.public_view_count || 0);
}

export function getPropertyImage(property?: Property) {
  return getPropertyThumbnailUrl(property);
}

export function hasGoogleMap(property: Property) {
  return Number.isFinite(property.map_latitude) && Number.isFinite(property.map_longitude);
}

export function getGoogleMapUrl(property: Property) {
  return `https://maps.google.com/maps?q=${property.map_latitude},${property.map_longitude}&z=16&output=embed`;
}

export function getGoogleMapLink(property: Property) {
  return `https://www.google.com/maps/search/?api=1&query=${property.map_latitude},${property.map_longitude}`;
}

export function getPropertySlug(property: Property) {
  return getPublicPropertySlug(property);
}

export function getPropertyPath(property: Property) {
  return `/${encodeURIComponent(getPropertySlug(property))}`;
}

export function getPropertySlugFromPath(pathname: string) {
  const segment = pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '';
  if (!segment || segment === 'admin' || segment === 'listings' || segment === 'bds-da-nang') {
    return '';
  }
  try {
    return decodeURIComponent(segment).toLowerCase();
  } catch {
    return segment.toLowerCase();
  }
}

export function findPropertyFromLocation(
  items: Property[],
  pathname: string,
  search: string,
  slugParam?: string,
) {
  const active = items.filter(
    property => !['sold', 'hidden'].includes(property.sale_status || 'available'),
  );
  const propertyId = new URLSearchParams(search).get('property');
  const normalizedSlug =
    getPropertySlugFromPath(pathname) || decodeURIComponent(slugParam || '').toLowerCase();
  if (!propertyId && !normalizedSlug) return null;
  return (
    active.find(
      item => item.id === propertyId || getPropertySlug(item).toLowerCase() === normalizedSlug,
    ) ?? null
  );
}

export { toPlainText, truncateText } from './text';
