import type { Property } from '../src/types';
import { stripPropertyImagesForApi } from '../src/utils/propertyImage';

export interface PublicPropertyDTO {
  id: string;
  title: string;
  price: number;
  area: number;
  location: string;
  type?: string;
  status?: string;
  sale_status?: string;
  direction?: string;
  legal_status?: string;
  description?: string;
  rich_description?: string;
  images?: string;
  gallery_images?: string[];
  features?: string[];
  selling_points?: string[];
  project_name?: string;
  road_width?: number;
  floors?: number;
  bedrooms?: number;
  bathrooms?: number;
  slug?: string;
  seo_title?: string;
  meta_description?: string;
  schema_json_ld?: Record<string, unknown>;
  market_zone?: string;
  block?: string;
  lot?: string;
  street?: string;
  created_at?: string;
  created_by_user_id?: string;
  owner_user_id?: string;
  contact_phone?: string;
  listing_source?: 'broker' | 'owner';
}

export function toPublicPropertySummary(property: Property): PublicPropertyDTO {
  const stripped = stripPropertyImagesForApi(property);
  const primaryImage = typeof stripped.images === 'string'
    ? stripped.images
    : (Array.isArray(stripped.images) ? stripped.images[0] : (stripped.gallery_images?.[0] || ''));
  const gallery = Array.isArray(stripped.gallery_images)
    ? stripped.gallery_images
    : (Array.isArray(stripped.images) ? stripped.images : (primaryImage ? [primaryImage] : []));

  // Strict allowlist: explicitly exclude internal fields
  const dto: PublicPropertyDTO = {
    id: stripped.id,
    title: stripped.title,
    price: stripped.price,
    area: stripped.area,
    location: stripped.location,
    type: stripped.type,
    sale_status: stripped.sale_status,
    direction: stripped.direction,
    legal_status: stripped.legal_status,
    description: stripped.description,
    rich_description: stripped.rich_description,
    images: primaryImage,
    gallery_images: gallery,
    selling_points: stripped.selling_points,
    project_name: stripped.project_name,
    road_width: stripped.road_width,
    floors: stripped.floors,
    bedrooms: stripped.bedrooms,
    bathrooms: stripped.bathrooms,
    slug: stripped.slug,
    seo_title: stripped.seo_title,
    meta_description: stripped.meta_description,
    schema_json_ld: stripped.schema_json_ld,
    market_zone: stripped.market_zone,
    block: stripped.block,
    lot: stripped.lot,
    street: stripped.street,
    created_at: stripped.created_at,
    created_by_user_id: stripped.created_by_user_id,
    owner_user_id: stripped.owner_user_id,
    contact_phone: stripped.contact_phone,
    listing_source: stripped.listing_source,
  };
  return dto;
}

export function filterPublicProperties(properties: Property[]): PublicPropertyDTO[] {
  return properties
    .filter(property => !['sold', 'hidden'].includes(property.sale_status || 'available'))
    .map(toPublicPropertySummary);
}
