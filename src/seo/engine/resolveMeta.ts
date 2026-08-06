import { buildTitle } from '../utils/buildTitle';
import { buildDescription } from '../utils/buildDescription';
import type { SeoRouteDefinition } from '../registry/seoRouteRegistry';
import { PageType } from '../types/PageType';

export type SeoEntityLike = {
  title?: string;
  location?: string;
  area?: number | string;
  price?: number | string;
  legal_status?: string;
  type?: string;
  description?: string;
  rich_description?: string;
  selling_points?: string[];
  ai_posts?: {
    seo?: {
      title?: string;
      meta_description?: string;
    };
  };
};

export type ResolveMetaInput = {
  pageType: PageType;
  registryEntry?: SeoRouteDefinition;
  entity?: SeoEntityLike;
  overrides?: {
    title?: string;
    description?: string;
  };
  /** When true, append brand suffix (CSR SeoHead path). Default false. */
  appendBrand?: boolean;
  descriptionMaxLength?: number;
};

export type ResolvedMeta = {
  title: string;
  description: string;
};

/**
 * Title + description resolution — always via buildTitle / buildDescription.
 */
export function resolveMeta(input: ResolveMetaInput): ResolvedMeta {
  const { title: rawTitle } = pickTitle(input);
  const { description: rawDescription, fromStoredDescription } = pickDescription(input);

  let title = buildTitle(rawTitle, { appendBrand: input.appendBrand === true });
  if (input.pageType === PageType.PROPERTY) {
    title = title.length <= 60 ? title : `${title.slice(0, 57).trim()}...`;
  }

  return {
    title,
    description: buildDescription(rawDescription, {
      maxLength: fromStoredDescription ? undefined : input.descriptionMaxLength,
    }),
  };
}

function pickTitle(input: ResolveMetaInput): { title: string; fromStoredTitle: boolean } {
  if (input.overrides?.title) return { title: input.overrides.title, fromStoredTitle: true };

  if (input.pageType === PageType.PROPERTY && input.entity) {
    const stored = input.entity.ai_posts?.seo?.title;
    if (stored) return { title: stored, fromStoredTitle: true };
    return { title: propertyFallbackTitle(input.entity), fromStoredTitle: false };
  }

  if (input.registryEntry?.defaultTitle) {
    return { title: input.registryEntry.defaultTitle, fromStoredTitle: false };
  }
  return { title: '', fromStoredTitle: false };
}

function pickDescription(input: ResolveMetaInput): { description: string; fromStoredDescription: boolean } {
  if (input.overrides?.description) {
    return { description: input.overrides.description, fromStoredDescription: true };
  }

  if (input.pageType === PageType.PROPERTY && input.entity) {
    const stored = input.entity.ai_posts?.seo?.meta_description;
    if (stored) return { description: stored, fromStoredDescription: true };
    return { description: propertyFallbackDescription(input.entity), fromStoredDescription: false };
  }

  if (input.registryEntry?.defaultDescription) {
    return { description: input.registryEntry.defaultDescription, fromStoredDescription: false };
  }
  return { description: '', fromStoredDescription: false };
}

/** Preserves historical `getServerPropertySeoTitle` / ListingsPage formula (pre-limit). */
function propertyFallbackTitle(entity: SeoEntityLike): string {
  const title = String(entity.title || '').trim();
  const type = String(entity.type || '').toLowerCase();
  if (type.includes('căn') || type.includes('can')) {
    return `${title} | Căn Hộ Đà Nẵng Giá 2026`;
  }
  if (type.includes('shophouse')) {
    return `${title} | Shophouse Đà Nẵng Kinh Doanh`;
  }
  return `${title} | BĐS Sun Group Đà Nẵng`;
}

/** Preserves historical SSR `getPropertyShareMeta` description join. */
function propertyFallbackDescription(entity: SeoEntityLike): string {
  const sellingPoints = (entity.selling_points || []).filter(Boolean).slice(0, 4).join(' • ');
  return [
    `${entity.title} tại ${entity.location}`,
    `${entity.area} m2`,
    `${entity.price} tỷ`,
    entity.legal_status,
    sellingPoints,
    entity.rich_description || entity.description,
  ].filter(Boolean).join('. ');
}
