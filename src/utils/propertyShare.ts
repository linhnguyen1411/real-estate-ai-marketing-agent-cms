import { Property } from '../types';

export type PropertySharePlatform = 'facebook' | 'zalo' | 'tiktok' | 'native' | 'copy';

function toPlainText(value = '') {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, maxLength = 155) {
  const cleanValue = toPlainText(value);
  return cleanValue.length > maxLength
    ? `${cleanValue.slice(0, maxLength - 3).trim()}...`
    : cleanValue;
}

export function slugifyProperty(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function getPublicPropertySlug(property: Property) {
  return `${slugifyProperty(property.title)}-${property.id}`;
}

export function getPublicPropertyUrl(property: Property, origin = window.location.origin) {
  return `${origin}/${encodeURIComponent(getPublicPropertySlug(property))}`;
}

export function getPropertyShareData(property: Property, origin = window.location.origin) {
  const url = getPublicPropertyUrl(property, origin);
  const image = property.gallery_images?.[0] || property.images;
  const title = property.ai_posts?.seo?.title || `${property.title} | Estoria`;
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
