export {
  extractVietnamPhones,
  extractPhones,
  extractFirstPhone,
  preparePhoneText,
  type VietnamPhoneExtractResult
} from './extractVietnamPhones';

import { extractVietnamPhones } from './extractVietnamPhones';

/** Gom mọi cách đọc text từ DOM — Facebook hay tách SĐT qua nhiều span */
export function collectElementTexts(el: HTMLElement): string[] {
  const texts = new Set<string>();
  const add = (t: string) => {
    const v = t.replace(/\s+/g, ' ').trim();
    if (v.length >= 4) texts.add(v);
  };

  add(el.innerText || '');
  add(el.textContent || '');

  const parts: string[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = node.textContent?.trim();
    if (t && t.length >= 2) parts.push(t);
  }
  if (parts.length) {
    add(parts.join(' '));
    add(parts.join(''));
  }

  el.querySelectorAll('[data-ad-preview="message"], div[dir="auto"], span[dir="auto"], [role="article"]').forEach(n => {
    add((n as HTMLElement).innerText || '');
    add((n as HTMLElement).textContent || '');
  });

  el.querySelectorAll('a[href*="tel:"]').forEach(a => {
    add((a.getAttribute('href') || '').replace(/^tel:/i, ''));
    add(a.textContent || '');
  });

  return Array.from(texts);
}

export function extractPhonesFromElement(el: HTMLElement): string[] {
  const found = new Set<string>();
  const chunks = collectElementTexts(el);

  for (const chunk of chunks) {
    extractVietnamPhones(chunk).validPhones.forEach(p => found.add(p));
  }

  extractVietnamPhones(chunks.join('\n')).validPhones.forEach(p => found.add(p));

  return Array.from(found);
}

export function extractPhoneDetails(text: string) {
  return extractVietnamPhones(text);
}

export function extractFirstPhoneFromElement(el: HTMLElement): string {
  return extractPhonesFromElement(el)[0] || '';
}
