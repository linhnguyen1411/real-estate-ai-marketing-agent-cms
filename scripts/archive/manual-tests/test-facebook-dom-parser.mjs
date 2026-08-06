#!/usr/bin/env node
/**
 * Facebook DOM parser offline tests using Playwright setContent (no live Facebook).
 * Verifies feed-root scoping, post/comment separation, main-content extraction,
 * exact "See more" clicking and accepted-post fingerprinting.
 *
 * Run: npm run test:facebook-dom-parser
 */
import { chromium } from 'playwright';
import {
  parseVisibleFacebookPostsWithStats,
  expandSeeMoreInPost,
} from '../server/agent-worker/facebook/facebookDomParser.ts';
import { captureFeedFingerprint } from '../server/agent-worker/facebook/facebookScrollController.ts';
import { locateFacebookGroupFeed } from '../server/agent-worker/facebook/facebookFeedLocator.ts';

let passed = 0;
let failed = 0;
function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}
function fail(label, detail) {
  failed += 1;
  console.error(`  ✗ ${label}`);
  console.error('   ', detail || 'assertion failed');
}
function assert(cond, label, detail) {
  if (cond) ok(label);
  else fail(label, detail);
}

const ACTION_BAR = `
  <div role="button" aria-label="Thích">Thích</div>
  <div role="button" aria-label="Bình luận">Bình luận</div>
  <div role="button" aria-label="Chia sẻ">Chia sẻ</div>
`;

const FEED_HTML = `
<!doctype html><html><head><meta charset="utf-8"></head><body>
  <div role="feed">
    <div>
      <div role="article" aria-label="Post one">
        <h2><a role="link" href="/user/1">Author One</a></h2>
        <a href="/groups/123/posts/1001/"><abbr>2 giờ</abbr></a>
        <div data-ad-preview="message"><div dir="auto">POST ONE BODY selling apartment in Da Nang, cho thuê căn hộ 2 phòng ngủ.</div></div>
        ${ACTION_BAR}
        <div role="article" aria-label="Comment on post one">
          <a role="link" href="/user/9">Commenter</a>
          <div dir="auto">THIS IS A COMMENT and must never be saved as a post.</div>
          <div role="button" aria-label="Trả lời">Trả lời</div>
        </div>
      </div>
    </div>
    <div>
      <div role="article" aria-label="Post two">
        <h2><a role="link" href="/user/2">Author Two</a></h2>
        <a href="/groups/123/posts/1002/"><abbr>3 giờ</abbr></a>
        <div data-ad-preview="message"><div dir="auto">POST TWO BODY needs a 3 bedroom house for rent near the beach.</div></div>
        ${ACTION_BAR}
      </div>
    </div>
  </div>

  <div role="dialog" aria-label="Post detail">
    <div role="article" aria-label="Modal post">
      <a href="/groups/123/posts/2001/"><abbr>1 giờ</abbr></a>
      <div data-ad-preview="message"><div dir="auto">MODAL POST BODY must be ignored by the feed parser.</div></div>
      ${ACTION_BAR}
      <div role="article" aria-label="Modal comment">
        <div dir="auto">MODAL COMMENT must be ignored.</div>
        <div role="button" aria-label="Trả lời">Trả lời</div>
      </div>
    </div>
  </div>
</body></html>`;

const SEE_MORE_HTML = `
<!doctype html><html><head><meta charset="utf-8"></head>
<body>
  <script>window.__clicked = [];</script>
  <div role="feed">
    <div>
      <div id="pc" role="article" aria-label="See more post">
        <a href="/groups/123/posts/3001/"><abbr>1 giờ</abbr></a>
        <div dir="auto">Body...</div>
        <button onclick="window.__clicked.push('see_more_vi')">Xem thêm</button>
        <button onclick="window.__clicked.push('more_replies_vi')">Xem thêm phản hồi</button>
        <button onclick="window.__clicked.push('more_comments_vi')">Xem thêm bình luận</button>
        <button onclick="window.__clicked.push('see_more_en')">See more</button>
        <button onclick="window.__clicked.push('more_comments_en')">View more comments</button>
        <button onclick="window.__clicked.push('more_replies_en')">View more replies</button>
      </div>
    </div>
  </div>
</body></html>`;

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Executable doesn't exist") || message.includes('playwright install')) {
      console.log('  ⊘ skipped — Chromium chưa cài (npm run agent:install-browser)');
      process.exit(0);
    }
    throw e;
  }

  const page = await browser.newPage();

  // --- Feed scoping + post/comment separation ---
  console.log('\nFeed parsing (scope + classification)');
  await page.setContent(FEED_HTML, { url: 'https://www.facebook.com/groups/123' });

  const located = await locateFacebookGroupFeed(page);
  assert(located.found, 'locateFacebookGroupFeed finds the feed root');

  const result = await parseVisibleFacebookPostsWithStats(page);
  assert(result.postsAccepted === 2, `exactly 2 posts accepted (got ${result.postsAccepted})`);
  assert(!result.noFeed, 'feed present (noFeed=false)');
  assert(
    result.articleNodesObserved === 3,
    `article nodes observed = 3 (2 posts + 1 nested comment), got ${result.articleNodesObserved}`,
  );
  assert(result.commentsRejected >= 1, `nested comment rejected (got ${result.commentsRejected})`);

  const bodies = result.posts.map(p => p.contentText).join(' || ');
  assert(bodies.includes('POST ONE BODY'), 'post one body captured');
  assert(bodies.includes('POST TWO BODY'), 'post two body captured');
  assert(!bodies.includes('THIS IS A COMMENT'), 'post content excludes the nested comment');
  assert(!bodies.includes('MODAL POST BODY'), 'modal post NOT parsed (outside feed root)');
  assert(!bodies.includes('MODAL COMMENT'), 'modal comment NOT parsed');

  const ids = result.posts.map(p => p.externalId).sort();
  assert(ids.includes('1001') && ids.includes('1002'), 'external ids extracted from permalinks');

  // --- Fingerprint excludes comments ---
  console.log('\nAccepted-post fingerprint');
  const fp = await captureFeedFingerprint(page);
  assert(fp.articleCount === 2, `fingerprint counts only 2 top-level posts (got ${fp.articleCount})`);
  assert(
    fp.externalIds.includes('1001') && fp.externalIds.includes('1002'),
    'fingerprint external ids are post ids only',
  );

  // --- Exact "See more" clicking ---
  console.log('\nExact "See more" expansion');
  await page.setContent(SEE_MORE_HTML, { url: 'https://www.facebook.com/groups/123' });
  const postCard = page.locator('#pc');
  const clicks = await expandSeeMoreInPost(postCard);
  const clicked = await page.evaluate(() => window.__clicked);

  assert(clicks === 2, `exactly 2 see-more clicks (Xem thêm + See more), got ${clicks}`);
  assert(clicked.includes('see_more_vi'), 'clicked exact "Xem thêm"');
  assert(clicked.includes('see_more_en'), 'clicked exact "See more"');
  assert(!clicked.includes('more_replies_vi'), 'did NOT click "Xem thêm phản hồi"');
  assert(!clicked.includes('more_comments_vi'), 'did NOT click "Xem thêm bình luận"');
  assert(!clicked.includes('more_comments_en'), 'did NOT click "View more comments"');
  assert(!clicked.includes('more_replies_en'), 'did NOT click "View more replies"');

  await browser.close();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
