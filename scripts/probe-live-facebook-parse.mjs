#!/usr/bin/env node
import { chromium } from 'playwright';
import { parseVisibleFacebookPostsWithStats } from '../server/agent-worker/facebook/facebookDomParser.ts';
import { waitForFacebookFeedPostsHydrated } from '../server/agent-worker/facebook/facebookFeedLocator.ts';

const URL = process.argv[2] || 'https://www.facebook.com/groups/muabanbatdongsantaidanang';

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3000);

  const hydration = await waitForFacebookFeedPostsHydrated(page, {
    timeoutMs: 25_000,
    minHydrated: 1,
  });
  console.log('HYDRATION', hydration);

  const parsed = await parseVisibleFacebookPostsWithStats(page);
  console.log('PARSE STATS', {
    articleNodesObserved: parsed.articleNodesObserved,
    postCandidates: parsed.postCandidates,
    postsAccepted: parsed.postsAccepted,
    parseFailed: parsed.parseFailed,
    commentsRejected: parsed.commentsRejected,
    unknownArticlesRejected: parsed.unknownArticlesRejected,
  });

  for (const p of parsed.posts.slice(0, 5)) {
    console.log('ACCEPTED', {
      id: p.externalId,
      len: p.contentText.length,
      body: p.contentText.slice(0, 140),
    });
  }

  const diag = await page.evaluate(() => {
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return { noFeed: true };
    const arts = [...feed.querySelectorAll('[role="article"]')].slice(0, 10);
    return arts.map((a, idx) => {
      const inner = (a.innerText || '').replace(/\s+/g, ' ').trim();
      const msg = a.querySelector(
        '[data-ad-preview="message"], [data-ad-comet-preview="message"], div[data-ad-rendering-role="story_message"]',
      );
      const autos = [...a.querySelectorAll('div[dir="auto"], span[dir="auto"]')]
        .map(n => (n.innerText || '').trim())
        .filter(t => t.length > 5);
      const permalink = [...a.querySelectorAll('a[href*="/posts/"]')]
        .map(l => l.getAttribute('href') || '')
        .find(h => h.includes('/posts/'));
      const loading = !!a.querySelector('[data-visualcompletion="loading-state"]');
      const aria = a.getAttribute('aria-label') || '';
      return {
        idx,
        innerLen: inner.length,
        innerHead: inner.slice(0, 100),
        hasMsg: !!msg,
        msgLen: msg ? (msg.innerText || '').length : 0,
        msgHead: msg ? (msg.innerText || '').slice(0, 100) : null,
        autoBlocks: autos.length,
        autoLongest: autos.sort((x, y) => y.length - x.length)[0]?.slice(0, 100),
        permalink: permalink?.slice(0, 80),
        loading,
        aria: aria.slice(0, 60),
      };
    });
  });
  console.log('DIAG', JSON.stringify(diag, null, 1));

  await page.close();
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
