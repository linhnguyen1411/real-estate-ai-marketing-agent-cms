#!/usr/bin/env node
import { chromium } from 'playwright';

const URL = process.argv[2] || 'https://www.facebook.com/groups/muabanbatdongsantaidanang';

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(5000);

  // Compare scroll strategies
  const scrollTest = await page.evaluate(async () => {
    const feed = document.querySelector('[role="feed"]');
    const results = [];
    const snap = () => ({
      winY: Math.round(window.scrollY),
      feedTop: feed ? Math.round(feed.scrollTop) : -1,
      feedScrollH: feed ? feed.scrollHeight : -1,
      feedClientH: feed ? feed.clientHeight : -1,
      bodyH: document.body.scrollHeight,
      winH: window.innerHeight,
    });
    results.push({ step: 'start', ...snap() });

    if (feed) {
      feed.scrollBy(0, 2000);
      results.push({ step: 'feed.scrollBy(2000)', ...snap() });
      feed.scrollTop += 2000;
      results.push({ step: 'feed.scrollTop+=2000', ...snap() });
    }
    window.scrollBy(0, 2000);
    results.push({ step: 'window.scrollBy(2000)', ...snap() });
    window.scrollTo(0, window.scrollY + 2000);
    results.push({ step: 'window.scrollTo+2000', ...snap() });

    // find scrollable ancestors of feed
    const scrollables = [];
    let el = feed;
    while (el && el !== document.body) {
      const st = getComputedStyle(el);
      const can =
        /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 20;
      if (can) {
        scrollables.push({
          tag: el.tagName,
          role: el.getAttribute('role'),
          cls: (el.className || '').toString().slice(0, 40),
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        });
      }
      el = el.parentElement;
    }
    return { results, scrollables };
  });
  console.log('SCROLL_TEST', JSON.stringify(scrollTest, null, 2));

  // Inspect loading articles deeply
  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(4000);

  const loadingDiag = await page.evaluate(() => {
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return { noFeed: true };
    const arts = [...feed.querySelectorAll('[role="article"]')];
    return arts.map((a, idx) => {
      const loadingNodes = [...a.querySelectorAll('[data-visualcompletion="loading-state"]')];
      const aria = a.getAttribute('aria-label') || '';
      const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
      const html = a.innerHTML;
      const hasMessage = !!a.querySelector(
        '[data-ad-preview="message"], [data-ad-comet-preview="message"], div[data-ad-rendering-role="story_message"], div[dir="auto"]',
      );
      // strip loading nodes and see leftover text
      const clone = a.cloneNode(true);
      clone.querySelectorAll('[data-visualcompletion="loading-state"]').forEach(n => n.remove());
      const withoutLoading = (clone.innerText || '').replace(/\s+/g, ' ').trim();
      return {
        idx,
        aria: aria.slice(0, 80),
        textLen: text.length,
        textHead: text.slice(0, 100),
        loadingNodeCount: loadingNodes.length,
        loadingArias: loadingNodes.map(n => (n.getAttribute('aria-label') || '').slice(0, 40)),
        withoutLoadingLen: withoutLoading.length,
        withoutLoadingHead: withoutLoading.slice(0, 120),
        hasMessage,
        htmlHasPosts: /\/posts\//.test(html),
        htmlLen: html.length,
        // false positive? loading-state present but also real content?
        suspicious: loadingNodes.length > 0 && withoutLoading.length >= 40,
      };
    });
  });
  console.log('LOADING_DIAG', JSON.stringify(loadingDiag, null, 2));

  // Try clicking "Phù hợp nhất" / "Mới nhất" sort
  const sorts = await page.evaluate(() => {
    return [...document.querySelectorAll('[role="button"], [role="listbox"], [aria-haspopup]')]
      .map(el => ({
        text: (el.innerText || '').trim().slice(0, 40),
        aria: (el.getAttribute('aria-label') || '').slice(0, 50),
      }))
      .filter(x => /phù hợp|mới nhất|most relevant|newest|recent/i.test(x.text + x.aria))
      .slice(0, 10);
  });
  console.log('SORT_CONTROLS', sorts);

  await page.close();
  await browser.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
