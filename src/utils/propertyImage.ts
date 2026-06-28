import type { Property } from '../types';

const CARD_FALLBACK =
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=75';

function hasEmbeddedImage(property: Property) {
  const first = property.gallery_images?.[0] || property.images || '';
  return first.startsWith('data:image/') || Boolean(property.id);
}

export function getPropertyThumbnailUrl(property?: Property, index = 0): string {
  if (!property) return CARD_FALLBACK;
  if (property.id && hasEmbeddedImage(property)) {
    return `/property-images/${encodeURIComponent(property.id)}/${index}.jpg`;
  }
  return property.gallery_images?.[index] || property.images || CARD_FALLBACK;
}

export function getPropertyGalleryUrls(property: Property): string[] {
  const count = property.gallery_images?.length || (property.images ? 1 : 0);
  if (property.id && count > 0 && hasEmbeddedImage(property)) {
    return Array.from({ length: Math.max(count, 1) }, (_, index) =>
      getPropertyThumbnailUrl(property, index),
    );
  }
  if (property.gallery_images?.length) return property.gallery_images;
  if (property.images) return [property.images];
  return [CARD_FALLBACK];
}

function hasEmbeddedImageData(property: Property) {
  return (
    property.gallery_images?.some(image => image.startsWith('data:image/')) ||
    property.images?.startsWith('data:image/')
  );
}

export function stripPropertyImagesForApi(property: Property): Property {
  const galleryCount = property.gallery_images?.length || (property.images?.startsWith('data:') ? 1 : 0);
  if (!property.id || !hasEmbeddedImageData(property)) {
    const { internal_notes: _internal, ...rest } = property;
    return rest;
  }

  const urls = Array.from({ length: Math.max(galleryCount, 1) }, (_, index) =>
    `/property-images/${encodeURIComponent(property.id)}/${index}.jpg`,
  );

  const { internal_notes: _internal, ...rest } = property;
  return {
    ...rest,
    images: urls[0],
    gallery_images: urls,
  };
}
