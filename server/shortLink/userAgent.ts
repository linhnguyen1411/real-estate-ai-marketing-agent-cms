export function parseUserAgent(userAgent = ''): { device: string; browser: string; os: string } {
  const ua = userAgent || '';
  const device = /mobile|android|iphone|ipod|windows phone/i.test(ua)
    ? 'mobile'
    : /ipad|tablet/i.test(ua)
      ? 'tablet'
      : 'desktop';

  let browser = 'unknown';
  if (/edg\//i.test(ua)) browser = 'edge';
  else if (/chrome|crios/i.test(ua)) browser = 'chrome';
  else if (/safari/i.test(ua)) browser = 'safari';
  else if (/firefox/i.test(ua)) browser = 'firefox';
  else if (/fbav|facebookexternalhit/i.test(ua)) browser = 'facebook';

  let os = 'unknown';
  if (/windows/i.test(ua)) os = 'windows';
  else if (/android/i.test(ua)) os = 'android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'ios';
  else if (/mac os/i.test(ua)) os = 'macos';
  else if (/linux/i.test(ua)) os = 'linux';

  return { device, browser, os };
}
