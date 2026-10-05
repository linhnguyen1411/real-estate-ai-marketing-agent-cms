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
  images?: string[];
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
}

export function toPublicPropertySummary(property: Property): PublicPropertyDTO {
  const stripped = stripPropertyImagesForApi(property);
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
    images: stripped.images ? [stripped.images] : [],
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
  };
  return dto;
}

export function filterPublicProperties(properties: Property[]): PublicPropertyDTO[] {
  return properties
    .filter(property => !['sold', 'hidden'].includes(property.sale_status || 'available'))
    .map(toPublicPropertySummary);
}
