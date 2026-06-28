/** Resolve OG / Facebook share image URLs */

const DEFAULT_OG_IMAGE = '/logo.jpg';

export function extractFirstImageFromContent(
  content?: string | null,
  contentHtml?: string | null,
): string | null {
  const markdown = String(content || '');
  const mdMatch = markdown.match(/!\[[^\]]*]\(([^)]+)\)/);
  if (mdMatch?.[1]) return mdMatch[1].trim();

  const html = String(contentHtml || '');
  const htmlMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (htmlMatch?.[1]) return htmlMatch[1].trim();

  return null;
}

export function resolveShareImageUrl(
  image: string | null | undefined,
  origin: string,
  fallback: string = DEFAULT_OG_IMAGE,
): string {
  const base = origin.replace(/\/+$/, '');
  const pick = String(image || '').trim() || fallback;
  let url = pick;
  if (/^https?:\/\//i.test(pick)) {
    url = pick;
  } else if (pick.startsWith('//')) {
    url = `${base.startsWith('https') ? 'https' : 'http'}:${pick}`;
  } else if (pick.startsWith('/')) {
    url = `${base}${pick}`;
  } else {
    url = `${base}/${pick}`;
  }
  if (base.startsWith('https://')) {
    url = url.replace(/^http:\/\//i, 'https://');
  }
  return url;
}

export function guessImageMimeType(url: string): string {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export function resolveBlogShareImage(input: {
  coverImage?: string | null;
  content?: string | null;
  contentHtml?: string | null;
  origin: string;
}): string {
  const fromCover = input.coverImage?.trim();
  const fromBody = extractFirstImageFromContent(input.content, input.contentHtml);
  return resolveShareImageUrl(fromCover || fromBody, input.origin);
}
