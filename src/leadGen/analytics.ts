declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const SESSION_KEY = 'investor_lead_session';

export function getLeadSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function getUtmParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '',
  };
}

export function inferChannel(): string {
  const utm = getUtmParams();
  if (utm.utm_source.includes('facebook') || utm.utm_medium === 'facebook') return 'facebook';
  if (utm.utm_source.includes('tiktok')) return 'tiktok';
  if (utm.utm_source.includes('google') && utm.utm_medium === 'cpc') return 'google_ads';
  if (utm.utm_source.includes('google')) return 'google';
  const ref = typeof document !== 'undefined' ? document.referrer : '';
  if (ref.includes('facebook') || ref.includes('fb.')) return 'facebook';
  if (ref.includes('tiktok')) return 'tiktok';
  if (ref.includes('google')) return 'google';
  return 'direct';
}

export function trackGa4Event(
  eventName: string,
  params: Record<string, string | number | boolean | undefined> = {}
) {
  const page_path = typeof window !== 'undefined' ? window.location.pathname : '';
  const payload = { page_path, ...params };

  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, payload);
  }

  fetch('/api/public/leads/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: eventName,
      session_id: getLeadSessionId(),
      page_path,
      event_data: payload,
    }),
  }).catch(() => undefined);
}

export function trackPhoneClick(source = 'floating') {
  trackGa4Event('phone_click', { link_source: source });
}

export function trackZaloClick(source = 'floating') {
  trackGa4Event('zalo_click', { link_source: source });
}

export function trackMessengerClick(source = 'floating') {
  trackGa4Event('messenger_click', { link_source: source });
}

export function trackPropertyShareOpen(propertyId: string, shortSlug?: string) {
  trackGa4Event('property_share_open', { property_id: propertyId, short_slug: shortSlug });
}

export function trackPropertyShareCopy(propertyId: string, shortSlug?: string) {
  trackGa4Event('property_share_copy', { property_id: propertyId, short_slug: shortSlug });
}

export function trackPropertyShareFacebook(propertyId: string, shortSlug?: string) {
  trackGa4Event('property_share_facebook', { property_id: propertyId, short_slug: shortSlug });
}

export function trackPropertyShareZalo(propertyId: string, shortSlug?: string) {
  trackGa4Event('property_share_zalo', { property_id: propertyId, short_slug: shortSlug });
}

export function trackPropertyShareTiktok(propertyId: string, shortSlug?: string) {
  trackGa4Event('property_share_tiktok', { property_id: propertyId, short_slug: shortSlug });
}

export function trackQrView(shortSlug: string) {
  trackGa4Event('qr_view', { short_slug: shortSlug });
}

export function trackQrDownload(shortSlug: string) {
  trackGa4Event('qr_download', { short_slug: shortSlug });
}

export function storeMagnetAccess(slug: string, token: string) {
  localStorage.setItem(`magnet_access_${slug}`, token);
  localStorage.setItem('magnet_access_token', token);
}

export function getMagnetAccess(slug: string): string | null {
  return localStorage.getItem(`magnet_access_${slug}`) || localStorage.getItem('magnet_access_token');
}

export function clearMagnetAccess(slug?: string) {
  if (slug) localStorage.removeItem(`magnet_access_${slug}`);
  localStorage.removeItem('magnet_access_token');
}

export const POPUP_DISMISS_KEY = 'investor_popup_dismissed_at';
export const EXIT_DISMISS_KEY = 'investor_exit_dismissed_at';

export function wasPopupDismissedRecently(key: string, hours = 24): boolean {
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  const dismissed = Number(raw);
  return Date.now() - dismissed < hours * 60 * 60 * 1000;
}

export function markPopupDismissed(key: string) {
  localStorage.setItem(key, String(Date.now()));
}
