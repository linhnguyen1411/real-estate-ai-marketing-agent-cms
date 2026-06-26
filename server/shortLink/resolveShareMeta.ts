import type { Property } from '../../src/types';
import type { ShortLink } from '../../src/types/shortLink';
import { getPublicPropertySlug } from '../../src/utils/propertyShare';
import { resolveBlogShareImage, guessImageMimeType } from '../../src/seo/shareImage';
import { getBlogPostBySlug } from '../blogDb';
import { ogImageDimensions, readImageDimensionsFromBuffer } from '../seo/ogImageMeta';
import type { ShortLinkShareMeta } from './socialCrawler';

function stripHtml(value: unknown) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateMeta(value: string, maxLength = 180) {
  const cleanValue = stripHtml(value);
  return cleanValue.length > maxLength
    ? `${cleanValue.slice(0, maxLength - 3).trim()}...`
    : cleanValue;
}

function limitSeoTitle(value: string) {
  return value.length <= 60 ? value : `${value.slice(0, 57).trim()}...`;
}

function absoluteUrl(value: string, origin: string) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `${origin.split(':')[0]}:${value}`;
  if (value.startsWith('/')) return `${origin}${value}`;
  return value;
}

function getPropertyImageValue(property: Property, index = 0) {
  return property.gallery_images?.[index] || property.images || '';
}

function getPropertyPublicImageUrl(property: Property, origin: string, index = 0) {
  const image = getPropertyImageValue(property, index);
  if (!image) return `${origin}/logo.jpg`;
  if (image.startsWith('data:image/')) {
    return `${origin}/property-images/${encodeURIComponent(property.id)}/${index}.jpg`;
  }
  return absoluteUrl(image, origin);
}

function getPropertyImageDimensions(property: Property, index = 0) {
  const image = getPropertyImageValue(property, index);
  const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  try {
    return readImageDimensionsFromBuffer(Buffer.from(match[2], 'base64'));
  } catch {
    return null;
  }
}

function buildPropertyShareMeta(property: Property, origin: string, shortUrl: string): ShortLinkShareMeta {
  const image = getPropertyPublicImageUrl(property, origin);
  const dims =
    getPropertyImageDimensions(property) ||
    ogImageDimensions(image, origin);
  const sellingPoints = (property.selling_points || []).filter(Boolean).slice(0, 4).join(' • ');
  const baseDescription = [
    `${property.title} tại ${property.location}`,
    `${property.area} m2`,
    `${property.price} tỷ`,
    property.legal_status,
    sellingPoints,
    property.rich_description || property.description,
  ]
    .filter(Boolean)
    .join('. ');

  return {
    title: limitSeoTitle(property.ai_posts?.seo?.title || `${property.title} | Estoria`),
    description: property.ai_posts?.seo?.meta_description || truncateMeta(baseDescription),
    image,
    url: shortUrl,
    imageWidth: dims.width,
    imageHeight: dims.height,
    imageType: guessImageMimeType(image),
    ogType: 'product',
  };
}

export async function resolveShareMetaForShortLink(
  shortLink: ShortLink,
  origin: string,
  getProperties: () => Property[],
): Promise<ShortLinkShareMeta> {
  const shortUrl = `${origin}/s/${shortLink.slug}`;
  const fallback: ShortLinkShareMeta = {
    title: limitSeoTitle(shortLink.title || 'Estoria BĐS Đà Nẵng'),
    description: truncateMeta(shortLink.description || 'Xem chi tiết bất động sản tại Estoria.'),
    image: `${origin}/logo.jpg`,
    url: shortUrl,
    ogType: 'website',
    imageWidth: 1200,
    imageHeight: 630,
    imageType: 'image/jpeg',
  };

  if (shortLink.entity_type === 'property' && shortLink.entity_id) {
    const property = getProperties().find(
      item => item.id === shortLink.entity_id && !['sold', 'hidden'].includes(item.sale_status || 'available'),
    );
    if (property) return buildPropertyShareMeta(property, origin, shortUrl);
  }

  if (shortLink.entity_type === 'blog_post' && shortLink.entity_id) {
    const post = await getBlogPostBySlug(shortLink.entity_id, true);
    if (post) {
      const image = resolveBlogShareImage({
        coverImage: post.coverImage,
        content: post.content,
        contentHtml: post.contentHtml,
        origin,
      });
      const dims = ogImageDimensions(image, origin);
      return {
        title: limitSeoTitle(post.metaTitle || post.title),
        description: truncateMeta(post.metaDescription || post.excerpt || post.title),
        image,
        url: shortUrl,
        imageWidth: dims.width,
        imageHeight: dims.height,
        imageType: guessImageMimeType(image),
        ogType: 'article',
      };
    }
  }

  return fallback;
}

export function findPropertyForShortLinkTarget(
  targetUrl: string,
  getProperties: () => Property[],
): Property | undefined {
  try {
    const pathname = new URL(targetUrl).pathname.replace(/^\//, '');
    const decoded = decodeURIComponent(pathname).toLowerCase();
    return getProperties().find(property => {
      if (['sold', 'hidden'].includes(property.sale_status || 'available')) return false;
      return (
        property.id.toLowerCase() === decoded ||
        getPublicPropertySlug(property).toLowerCase() === decoded
      );
    });
  } catch {
    return undefined;
  }
}
