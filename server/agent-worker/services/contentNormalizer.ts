import crypto from 'crypto';
import { URL } from 'url';

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

const BINARY_EXTENSIONS = new Set([
  '.pdf', '.zip', '.rar', '.7z', '.gz', '.tar', '.exe', '.dmg',
  '.mp4', '.mp3', '.avi', '.mov', '.webm', '.mkv',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot',
]);

export interface ParsedPageContent {
  title: string;
  canonicalUrl: string;
  bodyText: string;
  links: string[];
  publishedAt: string | null;
}

export interface WebsiteSourceConfig {
  maxPages?: number;
  sameDomainOnly?: boolean;
  pageTimeoutMs?: number;
  maxContentChars?: number;
  maxLinksPerPage?: number;
  positiveKeywords?: string[];
  negativeKeywords?: string[];
  minScore?: number;
  notifyScore?: number;
  deepAnalyze?: boolean;
  prefilterMinScore?: number;
}

export function normalizeText(input: string, maxLength = 50_000): string {
  const collapsed = input
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength)}…`;
}

export function isPrivateIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some(o => o > 255)) return true;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function assertSafePublicUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`URL không hợp lệ: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Chỉ cho phép http/https: ${rawUrl}`);
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    throw new Error(`URL nội bộ bị chặn: ${rawUrl}`);
  }
  if (isPrivateIpv4(host)) {
    throw new Error(`Private IP bị chặn: ${rawUrl}`);
  }

  return parsed;
}

export function normalizeCanonicalUrl(url: string): string {
  const parsed = assertSafePublicUrl(url);
  parsed.hash = '';
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }
  return parsed.toString();
}

export function resolveLink(baseUrl: string, href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:')) {
    return null;
  }
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    const ext = resolved.pathname.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
    if (BINARY_EXTENSIONS.has(ext)) return null;
    return normalizeCanonicalUrl(resolved.toString());
  } catch {
    return null;
  }
}

export function isSameDomain(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
  } catch {
    return false;
  }
}

export function computeContentHash(canonicalUrl: string, normalizedBody: string): string {
  return crypto
    .createHash('sha256')
    .update(canonicalUrl)
    .update('\n')
    .update(normalizedBody)
    .digest('hex');
}

export function parseWebsiteConfig(raw: unknown): WebsiteSourceConfig {
  if (!raw || typeof raw !== 'object') return {};
  const config = raw as Record<string, unknown>;
  return {
    maxPages: clampInt(config.maxPages, 1, 25, 5),
    sameDomainOnly: config.sameDomainOnly !== false,
    pageTimeoutMs: clampInt(config.pageTimeoutMs, 5_000, 120_000, 30_000),
    maxContentChars: clampInt(config.maxContentChars, 1_000, 100_000, 20_000),
    maxLinksPerPage: clampInt(config.maxLinksPerPage, 1, 100, 30),
    positiveKeywords: toKeywordList(config.positiveKeywords),
    negativeKeywords: toKeywordList(config.negativeKeywords),
    minScore: clampInt(config.minScore, 0, 100, 50),
    notifyScore: clampInt(config.notifyScore, 0, 100, 75),
  };
}

export function buildRawMetadata(input: {
  title: string;
  canonicalUrl: string;
  linkCount: number;
  publishedAt: string | null;
  excerpt: string;
}): Record<string, unknown> {
  return {
    title: input.title,
    canonicalUrl: input.canonicalUrl,
    linkCount: input.linkCount,
    publishedAt: input.publishedAt,
    excerpt: input.excerpt.slice(0, 500),
  };
}

/** Lightweight HTML parse for offline tests (no Playwright). */
export function parseHtmlFixture(html: string, pageUrl: string): ParsedPageContent {
  const title = decodeHtml(matchOne(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? '');
  const canonicalHref =
    matchOne(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ??
    matchOne(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const canonicalUrl = canonicalHref ? resolveLink(pageUrl, canonicalHref) ?? pageUrl : pageUrl;

  const timeValue =
    matchOne(html, /<time[^>]+datetime=["']([^"']+)["']/i) ??
    matchOne(html, /property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);

  const bodyHtml = extractBodyHtml(html);
  const bodyText = normalizeText(stripTags(bodyHtml));

  const links: string[] = [];
  const linkRegex = /<a[^>]+href=["']([^"'#][^"']*)["']/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const resolved = resolveLink(pageUrl, linkMatch[1]);
    if (resolved) links.push(resolved);
  }

  return {
    title: title || 'Untitled',
    canonicalUrl: normalizeCanonicalUrl(canonicalUrl),
    bodyText,
    links: [...new Set(links)],
    publishedAt: timeValue,
  };
}

function matchOne(html: string, regex: RegExp): string | null {
  const match = regex.exec(html);
  return match?.[1]?.trim() ?? null;
}

function extractBodyHtml(html: string): string {
  const article = matchOne(html, /<article[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article;
  const main = matchOne(html, /<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main;
  const body = matchOne(html, /<body[^>]*>([\s\S]*?)<\/body>/i);
  return body ?? html;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function toKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim().toLowerCase()).filter(Boolean);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

/** Browser-side extraction script (serialized for page.evaluate). */
export const BROWSER_EXTRACT_SCRIPT = `
(() => {
  const clone = document.cloneNode(true);
  clone.querySelectorAll('script, style, nav, footer, header, noscript, svg').forEach(el => el.remove());
  const root = clone.querySelector('article') || clone.querySelector('main') || clone.body;
  const bodyText = (root?.innerText || '').replace(/\\s+/g, ' ').trim();
  const canonical = clone.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
  const timeEl = clone.querySelector('time[datetime]');
  const metaPublished = clone.querySelector('meta[property="article:published_time"]');
  const links = Array.from(clone.querySelectorAll('a[href]'))
    .map(a => a.getAttribute('href') || '')
    .filter(Boolean);
  return {
    title: document.title || 'Untitled',
    canonicalHref: canonical,
    bodyText,
    links,
    publishedAt: timeEl?.getAttribute('datetime') || metaPublished?.getAttribute('content') || null,
  };
})()
`;
