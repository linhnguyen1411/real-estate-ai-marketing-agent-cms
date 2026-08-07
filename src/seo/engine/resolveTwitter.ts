import type { TwitterMeta } from '../types/SeoMetadata';

export type ResolveTwitterInput = {
  title: string;
  description: string;
  image?: string;
  card?: string;
};

/**
 * Twitter card object — single place only (values only; no HTML).
 */
export function resolveTwitter(input: ResolveTwitterInput): TwitterMeta {
  return {
    card: input.card || 'summary_large_image',
    title: input.title,
    description: input.description,
    image: input.image,
  };
}
