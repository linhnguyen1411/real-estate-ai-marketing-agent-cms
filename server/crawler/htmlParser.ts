import * as cheerio from 'cheerio';
import { extractPhones } from '../lib/extractVietnamPhones';

export {
  extractVietnamPhones,
  extractPhones,
  extractFirstPhone,
  normalizeToValidMobile10 as normalizePhone
} from '../lib/extractVietnamPhones';

const NEED_SIGNALS = [
  'can mua', 'can ban', 'can thue', 'mua nha', 'ban nha', 'ban dat',
  'thue nha', 'thue van phong', 'cho thue', 'can tim', 'lien he',
  'hotline', 'zalo', 'm²', 'm2', 'ty', 'tỷ', 'gia ban', 'gia thue'
];

function normalizeText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function stripDiacritics(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

export function hasNeedSignal(text: string) {
  const normalized = stripDiacritics(text);
  return NEED_SIGNALS.some(signal => normalized.includes(signal));
}

export function parseHtmlPage(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe').remove();

  const title = normalizeText($('title').first().text() || $('h1').first().text() || '');
  const bodyText = normalizeText($('body').text() || $.root().text());
  const phones = extractPhones(bodyText);
  const links: string[] = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
    try {
      const absolute = new URL(href, baseUrl).href;
      links.push(absolute);
    } catch {
      // skip invalid URLs
    }
  });

  const rssLinks: string[] = [];
  $('link[rel="alternate"]').each((_, el) => {
    const type = ($(el).attr('type') || '').toLowerCase();
    const href = $(el).attr('href');
    if (!href) return;
    if (type.includes('rss') || type.includes('atom') || type.includes('xml')) {
      try {
        rssLinks.push(new URL(href, baseUrl).href);
      } catch {
        // skip
      }
    }
  });

  return { title, text: bodyText.slice(0, 8000), phones, links: [...new Set(links)], rssLinks: [...new Set(rssLinks)] };
}

export function parseGoogleSearchResults(html: string) {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.startsWith('/url?q=')) {
      try {
        const url = new URL(href, 'https://www.google.com');
        const target = url.searchParams.get('q');
        if (target && target.startsWith('http')) links.push(target);
      } catch {
        // skip
      }
    } else if (href.startsWith('http') && !href.includes('google.com')) {
      links.push(href);
    }
  });

  return [...new Set(links)].slice(0, 10);
}

export function parseRssFeed(xml: string, baseUrl: string) {
  const items: Array<{ title: string; link: string; text: string }> = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  for (const block of itemBlocks.slice(0, 20)) {
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const link =
      block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ||
      block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() ||
      '';
    const description =
      (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ||
        block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ||
        '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').trim();

    if (title || link) {
      items.push({
        title: normalizeText(title),
        link: link ? new URL(link, baseUrl).href : baseUrl,
        text: normalizeText(description)
      });
    }
  }

  return items;
}

export function isRssUrl(url: string) {
  const lower = url.toLowerCase();
  return lower.includes('/feed') || lower.endsWith('.xml') || lower.includes('rss') || lower.includes('atom');
}
