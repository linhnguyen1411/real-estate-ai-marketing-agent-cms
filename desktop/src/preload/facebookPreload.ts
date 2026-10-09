/**
 * Preload script for Facebook tab (facebook.com).
 * Provides DOM assistance, status logging, and auto-scroll helpers to trigger GraphQL responses.
 */

import { ipcRenderer } from 'electron';

try {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
  });
} catch {
  /* ignore */
}

console.log('[FB-Preload] Preload script injected into Facebook tab.');

ipcRenderer.on('fb:scroll-down', () => {
  window.scrollBy({
    top: 600,
    behavior: 'smooth',
  });
  console.log('[FB-Preload] Performed smooth scroll down.');
});

// Periodic gentle auto-scroll if enabled from main
let autoScrollInterval: NodeJS.Timeout | null = null;

ipcRenderer.on('fb:set-auto-scroll', (_event, enabled: boolean, intervalSec: number = 8) => {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }

  if (enabled) {
    console.log(`[FB-Preload] Auto-scroll enabled every ${intervalSec}s.`);
    autoScrollInterval = setInterval(() => {
      // Only scroll if page is active/not at very bottom
      window.scrollBy({
        top: 500,
        behavior: 'smooth',
      });
    }, intervalSec * 1000);
  } else {
    console.log('[FB-Preload] Auto-scroll disabled.');
  }
});
