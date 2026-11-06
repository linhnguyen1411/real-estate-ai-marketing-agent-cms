import { Property } from '../types';
import { RESERVED_SLUGS } from '../seo/siteConfig';
import { truncateText } from './text';

export type PropertySharePlatform = 'facebook' | 'zalo' | 'tiktok' | 'native' | 'copy';

const PROPERTY_SLUG_MAX_LENGTH = 120;

export function slugifyProperty(value: string) {
  const full = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (full.length <= PROPERTY_SLUG_MAX_LENGTH) return full;
  const truncated = full.slice(0, PROPERTY_SLUG_MAX_LENGTH);
  const lastDash = truncated.lastIndexOf('-');
  return (lastDash > 40 ? truncated.slice(0, lastDash) : truncated).replace(/-+$/g, '');
}

/** Stable public slug: explicit `property.slug` wins, otherwise derived from the title. */
export function getPublicPropertySlug(property: Property) {
  const explicit = slugifyProperty(property.slug || '');
  if (explicit) return explicit;
  return slugifyProperty(property.title);
}

export function buildPropertySlug(title: string) {
  return slugifyProperty(title);
}

/** Returns `base`, or `base-2`, `base-3`… when it collides with another slug or a reserved route. */
export function allocatePropertySlug(base: string, taken: Iterable<string>) {
  const used = new Set(RESERVED_SLUGS);
  for (const value of taken) {
    const slug = String(value || '').trim().toLowerCase();
    if (slug) used.add(slug);
  }
  const root = base || 'bds';
  if (!used.has(root)) return root;
  let index = 2;
  while (used.has(`${root}-${index}`)) index += 1;
  return `${root}-${index}`;
}

/** Matches both the canonical slug and legacy `<title-slug>-<property.id>` URLs. */
export function matchesPropertySlug(property: Property, rawSlug: string) {
  const slug = String(rawSlug || '').trim().toLowerCase();
  const id = String(property.id || '').trim().toLowerCase();
  if (!slug) return false;
  if (getPublicPropertySlug(property).toLowerCase() === slug) return true;
  if (!id) return false;
  return slug === id || slug.endsWith(`-${id}`);
}

export function getPublicPropertyUrl(property: Property, origin = window.location.origin) {
  return `${origin}/${encodeURIComponent(getPublicPropertySlug(property))}`;
}

export function getPropertyShareData(property: Property, origin = window.location.origin) {
  const url = getPublicPropertyUrl(property, origin);
  const image = property.gallery_images?.[0] || property.images;
  const title = property.ai_posts?.seo?.title || `${property.title} | House & Life`;
  const description = property.ai_posts?.seo?.meta_description || truncateText(
    `${property.title} tại ${property.location}, diện tích ${property.area} m2, giá ${property.price} tỷ. ${property.rich_description || property.description}`
  );
  const caption = [
    title,
    description,
    url
  ].filter(Boolean).join('\n\n');

  return { title, description, image, url, caption };
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export async function shareProperty(
  property: Property,
  platform: PropertySharePlatform,
  options: {
    origin?: string;
    onCopied?: () => void;
    onError?: (error: unknown) => void;
  } = {}
) {
  const shareData = getPropertyShareData(property, options.origin);
  const encodedUrl = encodeURIComponent(shareData.url);

  try {
    if (platform === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank', 'noopener,noreferrer,width=720,height=640');
      return;
    }

    if (platform === 'zalo') {
      window.open(`https://zalo.me/share?u=${encodedUrl}`, '_blank', 'noopener,noreferrer,width=720,height=640');
      return;
    }

    if (platform === 'native' || platform === 'tiktok') {
      if (navigator.share) {
        await navigator.share({
          title: shareData.title,
          text: shareData.description,
          url: shareData.url
        });
        return;
      }
    }

    await copyText(platform === 'copy' ? shareData.url : shareData.caption);
    options.onCopied?.();

    if (platform === 'tiktok') {
      window.open('https://www.tiktok.com/upload?lang=vi-VN', '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return;
    options.onError?.(error);
  }
}
