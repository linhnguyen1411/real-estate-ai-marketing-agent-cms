/**
 * Preload script for Facebook tab (facebook.com).
 * High-Speed DOM extraction, auto "Xem thêm" expander, and turbo auto-scroll.
 */

import { ipcRenderer } from 'electron';

try {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
  });
} catch {
  /* ignore */
}

console.log('[FB-Preload] Turbo preload injected into Facebook tab.');

const seenDomKeys = new Set<string>();
const reKeywords =
  /(?:tỷ|ty|triệu|tr|bán|cần mua|tìm mua|cho thuê|cần thuê|đất|nhà|bất động sản|bds|bđs|nam hòa xuân|hòa xuân|đà nẵng|lô|block|b2|m2|liên hệ|sđt|zalo|inbox|chính chủ|cc|mặt tiền|kiệt|đường|hướng|sổ|ngộp|hạ giá|cắt lỗ|căn hộ|chung cư|villa|biệt thự|\d{9,11})/i;

function clickSeeMoreButtons(): void {
  try {
    const buttons = document.querySelectorAll('div[role="button"], span');
    buttons.forEach((el) => {
      const txt = el.textContent?.trim();
      if (txt === 'Xem thêm' || txt === 'See more') {
        (el as HTMLElement).click();
      }
    });
  } catch {
    /* ignore click errors */
  }
}

function extractPostsFromDom(): void {
  try {
    clickSeeMoreButtons();

    const textElements = document.querySelectorAll('div[dir="auto"]');
    textElements.forEach((el) => {
      const text = (el.textContent || '').trim();
      if (text.length < 22 || text.length > 6000) return;
      if (!reKeywords.test(text)) return;

      const key = text.slice(0, 80);
      if (seenDomKeys.has(key)) return;
      seenDomKeys.add(key);

      if (seenDomKeys.size > 2000) {
        const first = seenDomKeys.values().next().value;
        if (first) seenDomKeys.delete(first);
      }

      const container =
        el.closest('div[role="feed"] > div') ||
        el.closest('div[data-pagelet*="FeedUnit"]') ||
        el.parentElement?.parentElement?.parentElement;

      let authorName = 'Facebook User';
      let permalink = '';

      if (container) {
        const authorLink = container.querySelector('a[role="link"] strong, a[role="link"] span, h2, h3');
        if (authorLink && authorLink.textContent) {
          authorName = authorLink.textContent.trim();
        }
        const linkEl = container.querySelector(
          'a[href*="/posts/"], a[href*="/permalink/"], a[href*="facebook.com/groups/"]'
        ) as HTMLAnchorElement | null;
        if (linkEl && linkEl.href) {
          permalink = linkEl.href;
        }
      }

      ipcRenderer.send('fb:dom-post-captured', {
        authorName,
        contentText: text,
        canonicalUrl: permalink || undefined,
        timestamp: Date.now(),
      });
    });
  } catch (err) {
    /* ignore extraction errors */
  }
}

// Run DOM extraction frequently
setInterval(extractPostsFromDom, 1500);

// Manual scroll trigger
ipcRenderer.on('fb:scroll-down', () => {
  window.scrollBy({
    top: 1000,
    behavior: 'smooth',
  });
  setTimeout(extractPostsFromDom, 500);
});

// Periodic auto-scroll
let autoScrollInterval: NodeJS.Timeout | null = null;

ipcRenderer.on('fb:set-auto-scroll', (_event, enabled: boolean, intervalSec: number = 3) => {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }

  if (enabled) {
    const sec = Math.max(1, intervalSec);
    console.log(`[FB-Preload] Turbo auto-scroll enabled every ${sec}s.`);
    autoScrollInterval = setInterval(() => {
      window.scrollBy({
        top: 1100,
        behavior: 'smooth',
      });
      setTimeout(extractPostsFromDom, 600);
    }, sec * 1000);
  } else {
    console.log('[FB-Preload] Auto-scroll disabled.');
  }
});
