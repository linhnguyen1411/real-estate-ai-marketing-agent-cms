export function getBlogPostShareUrl(slug: string, origin?: string) {
  const base = (origin || (typeof window !== 'undefined' ? window.location.origin : 'https://bdsdanang.site')).replace(/\/+$/, '');
  return `${base}/tin-tuc/${encodeURIComponent(slug)}`;
}

export type BlogSharePlatform = 'facebook' | 'native' | 'copy';

export async function shareBlogPost(
  slug: string,
  platform: BlogSharePlatform,
  options: {
    title: string;
    excerpt?: string;
    origin?: string;
    onCopied?: () => void;
    onError?: (message: string) => void;
  },
) {
  const url = getBlogPostShareUrl(slug, options.origin);
  const encodedUrl = encodeURIComponent(url);

  try {
    if (platform === 'facebook') {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        '_blank',
        'noopener,noreferrer,width=720,height=640',
      );
      return;
    }

    if (platform === 'copy') {
      await navigator.clipboard.writeText(url);
      options.onCopied?.();
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: options.title,
          text: options.excerpt || options.title,
          url,
        });
        return;
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
      }
    }

    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      '_blank',
      'noopener,noreferrer,width=720,height=640',
    );
  } catch (error) {
    options.onError?.((error as Error).message || 'Không thể chia sẻ');
  }
}

export async function copyBlogPostLink(slug: string, origin?: string) {
  const url = getBlogPostShareUrl(slug, origin);
  await navigator.clipboard.writeText(url);
}
