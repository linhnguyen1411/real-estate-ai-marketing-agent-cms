#!/usr/bin/env node
/**
 * Live diagnostic: after each scroll, log every feed article + skip reason.
 * Usage: npx tsx scripts/probe-scroll-skip-reasons.mjs [groupUrl]
 */
import { chromium } from 'playwright';
import { classifyFacebookArticle } from '../server/agent-worker/facebook/facebookArticleClassifier.ts';
import { parseVisibleFacebookPostsWithStats } from '../server/agent-worker/facebook/facebookDomParser.ts';
import {
  waitForFacebookFeedPostsHydrated,
  waitForFacebookGroupFeed,
} from '../server/agent-worker/facebook/facebookFeedLocator.ts';

const URL =
  process.argv[2] || 'https://www.facebook.com/groups/muabanbatdongsantaidanang';

const EXTRACT_DIAG = `(() => {
  function pick(el) {
    return el ? (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  }
  function isLoading(article) {
    if (article.querySelector('[data-visualcompletion="loading-state"]')) return true;
    var aria = (article.getAttribute('aria-label') || '').toLowerCase();
    return aria.indexOf('đang tải') >= 0 || aria.indexOf('loading') >= 0;
  }
  function isComment(article) {
    var aria = ((article.getAttribute('aria-label') || '') + ' ' + (article.getAttribute('aria-description') || '')).toLowerCase();
    return /bình luận dưới tên|phản hồi dưới tên|comment by|comment on/.test(aria);
  }
  function depthOf(article) {
    var d = 0, cur = article.parentElement;
    while (cur) {
      if (cur.matches && cur.matches('[role="article"]')) d++;
      cur = cur.parentElement;
    }
    return d;
  }
  function permalink(article) {
    var links = article.querySelectorAll('a[href*="/posts/"], a[href*="permalink"], a[href*="story_fbid"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      if (!href) continue;
      if (href.indexOf('comment_id=') >= 0) continue;
      return href.slice(0, 90);
    }
    return '';
  }
  function hasMsg(article) {
    return !!article.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"], div[data-ad-rendering-role="story_message"]');
  }
  function hasShare(article) {
    var nodes = article.querySelectorAll('[aria-label], [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var label = (nodes[i].getAttribute('aria-label') || nodes[i].textContent || '').toLowerCase();
      if (/chia sẻ|share/.test(label)) return true;
    }
    return false;
  }
  var feed = document.querySelector('[role="feed"]');
  if (!feed) return { noFeed: true, articles: [] };
  var arts = Array.prototype.slice.call(feed.querySelectorAll('[role="article"]'));
  return {
    noFeed: false,
    scrollY: Math.round(window.scrollY || feed.scrollTop || 0),
    articles: arts.map(function (a, idx) {
      var text = pick(a);
      var loading = isLoading(a);
      var comment = isComment(a);
      var aria = (a.getAttribute('aria-label') || '').slice(0, 70);
      var reason = 'unknown';
      if (loading) reason = 'SKIP_LOADING_SKELETON';
      else if (comment) reason = 'SKIP_COMMENT_CARD';
      else if (depthOf(a) > 0) reason = 'SKIP_NESTED_ARTICLE';
      else if (text.length < 15) reason = 'SKIP_EMPTY_TEXT';
      else reason = 'CANDIDATE_POST';
      return {
        idx: idx,
        reason: reason,
        textLen: text.length,
        preview: text.slice(0, 120),
        aria: aria,
        hasMsg: hasMsg(a),
        hasShare: hasShare(a),
        permalink: permalink(a),
        depth: depthOf(a),
      };
    }),
  };
})()`;

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  console.log('GOTO', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForFacebookGroupFeed(page, 15_000);
  await page.waitForTimeout(2000);

  const tab = page.getByRole('tab', { name: /thảo luận|discussion/i }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click().catch(() => undefined);
    await page.waitForTimeout(2000);
  }

  for (let pass = 0; pass < 6; pass++) {
    const hydration = await waitForFacebookFeedPostsHydrated(page, {
      timeoutMs: 20_000,
      minHydrated: 1,
    });
    const diag = await page.evaluate(EXTRACT_DIAG);
    const parsed = await parseVisibleFacebookPostsWithStats(page);

    console.log('\n======== PASS', pass + 1, '========');
    console.log('HYDRATION', hydration);
    console.log('PARSER', {
      articles: parsed.articleNodesObserved,
      candidates: parsed.postCandidates,
      accepted: parsed.postsAccepted,
      parseFailed: parsed.parseFailed,
      commentsRejected: parsed.commentsRejected,
      unknownRejected: parsed.unknownArticlesRejected,
    });
    if (parsed.posts.length) {
      for (const p of parsed.posts.slice(0, 5)) {
        console.log('  ACCEPTED:', p.contentText.slice(0, 140));
      }
    }

    const counts = {};
    for (const a of diag.articles || []) {
      counts[a.reason] = (counts[a.reason] || 0) + 1;
      console.log(
        `  [${a.idx}] ${a.reason} len=${a.textLen} msg=${a.hasMsg} share=${a.hasShare} | ${a.preview || a.aria}`,
      );
    }
    console.log('REASON_COUNTS', counts);

    // scroll like worker (fast) then wait
    const before = diag.scrollY;
    await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (feed) feed.scrollBy(0, 1600);
      else window.scrollBy(0, 1600);
    });
    await page.waitForTimeout(800); // intentionally short — mimic "cơn gió"
    const after = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      return Math.round(window.scrollY || (feed && feed.scrollTop) || 0);
    });
    console.log('SCROLL', { before, after, delta: after - before, pauseMs: 800 });
  }

  await page.close();
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
