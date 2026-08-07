import { SITE } from '../siteConfig';
import type { OpenGraphMeta } from '../types/SeoMetadata';

export type ResolveOgInput = {
  title: string;
  description: string;
  url: string;
  type?: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  locale?: string;
  siteName?: string;
};

/**
 * Open Graph object — single place only (values only; no HTML).
 */
export function resolveOg(input: ResolveOgInput): OpenGraphMeta {
  return {
    title: input.title,
    description: input.description,
    url: input.url,
    type: input.type || 'website',
    image: input.image,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    locale: input.locale || SITE.locale,
    siteName: input.siteName || SITE.name,
  };
}
