const SHORT_LINK_KEY = 'estoria_short_link_slug';

export function captureShortLinkFromUrl(): void {
  if (typeof window === 'undefined') return;
  const slug = new URLSearchParams(window.location.search).get('sl');
  if (slug) {
    sessionStorage.setItem(SHORT_LINK_KEY, slug);
  }
}

export function getStoredShortLinkSlug(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(SHORT_LINK_KEY) || '';
}

export function clearStoredShortLinkSlug(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SHORT_LINK_KEY);
}
