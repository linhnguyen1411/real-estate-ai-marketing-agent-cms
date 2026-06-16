const USER_AGENT = 'RealEstateCrawlerBot/1.0 (+public-only; contact: admin@bdsdanang.site)';
const FETCH_TIMEOUT_MS = 15000;
const REQUEST_DELAY_MS = 1200;

let lastFetchAt = 0;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export function isAllowedPublicUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (isPrivateHost(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isBlockedResponse(html: string, status: number) {
  if (status === 403 || status === 429 || status === 503) return true;
  const lower = html.toLowerCase();
  const captchaSignals = [
    'captcha',
    'unusual traffic',
    'recaptcha',
    'cf-challenge',
    'access denied',
    'please enable javascript',
    'robot check'
  ];
  return captchaSignals.some(signal => lower.includes(signal));
}

export async function fetchPublicHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  if (!isAllowedPublicUrl(url)) {
    throw new Error(`URL không được phép (chỉ public http/https): ${url}`);
  }

  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < REQUEST_DELAY_MS) {
    await sleep(REQUEST_DELAY_MS - elapsed);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8'
      },
      redirect: 'follow'
    });

    const html = await response.text();
    lastFetchAt = Date.now();

    if (isBlockedResponse(html, response.status)) {
      throw new Error(`Nguồn chặn truy cập hoặc yêu cầu captcha (${response.status}): ${url}`);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} khi fetch ${url}`);
    }

    return { html, finalUrl: response.url || url };
  } finally {
    clearTimeout(timer);
  }
}
