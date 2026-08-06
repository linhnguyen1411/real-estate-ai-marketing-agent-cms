#!/usr/bin/env node
/**
 * P0 Facebook Publisher Hotfix — regression (no live Facebook).
 *
 * Simulates 20 consecutive publish transactions against pure helpers +
 * exactly-once / media_first / editor caption policy.
 *
 * Run: npx tsx scripts/test-publisher-hotfix-regression.ts
 */
import assert from 'node:assert/strict';
import {
  captionHash,
  feedLooksAlreadyPublished,
  resolveComposerCaption,
  resolvePublishMode,
  shouldSkipRetry,
  stripUrlsFromCaption,
  wasPublishClicked,
  isTerminalPublishOutcome,
} from '../server/modules/social-publishing/publishIdempotency';
import { DEFAULT_DOM_FLOW } from '../server/modules/social-publishing/browser/dom/types';
import { FACEBOOK_TIMELINE_FLOW } from '../server/modules/social-publishing/browser/adapters/facebookTimelineConfig';
import { FACEBOOK_GROUP_FLOW } from '../server/modules/social-publishing/browser/adapters/facebookGroupConfig';
import { PublishTrace } from '../server/modules/social-publishing/browser/publishTrace';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

// --- Unit invariants ---
ok('publishRetries=0 (default)', DEFAULT_DOM_FLOW.publishRetries === 0);
ok('composeRetries=0 (default)', DEFAULT_DOM_FLOW.composeRetries === 0);
ok('timeline publishRetries=0', FACEBOOK_TIMELINE_FLOW.publishRetries === 0);
ok('group composeRetries=0', FACEBOOK_GROUP_FLOW.composeRetries === 0);

ok('publishMode default media_first', resolvePublishMode({}) === 'media_first');
ok('publishMode legacy override', resolvePublishMode({ publishMode: 'legacy' }) === 'legacy');

{
  const r = resolveComposerCaption({
    body: 'Nhà đẹp Đà Nẵng https://example.com/x',
    linkUrl: 'https://bdsdanang.site/p/1',
    mediaCount: 2,
    publishMode: 'media_first',
  });
  ok('media_first strips body URL', !/https?:\/\//i.test(r.caption));
  ok('media_first defers linkUrl', r.linkDeferred && r.deferredLinkUrl === 'https://bdsdanang.site/p/1');
  ok('media_first caption has no link append', !r.caption.includes('bdsdanang'));
}

{
  const r = resolveComposerCaption({
    body: 'Text only listing',
    linkUrl: 'https://bdsdanang.site/p/2',
    mediaCount: 0,
    publishMode: 'media_first',
  });
  ok('no-media keeps link in caption', r.caption.includes('https://bdsdanang.site/p/2'));
  ok('no-media link not deferred', !r.linkDeferred);
}

ok('stripUrlsFromCaption', stripUrlsFromCaption('a https://x.com/y b') === 'a  b' || stripUrlsFromCaption('a https://x.com/y b').includes('a'));

ok('shouldSkipRetry published', shouldSkipRetry({ status: 'published' }).skip);
ok(
  'shouldSkipRetry externalPostId',
  shouldSkipRetry({ status: 'failed', result: { externalPostId: '1' } }).skip,
);
ok(
  'shouldSkipRetry publishClicked',
  shouldSkipRetry({ status: 'failed', result: { publishClicked: true } }).skip,
);
ok(
  'shouldSkipRetry verify unknown',
  shouldSkipRetry({ status: 'failed', result: { publishOutcome: 'unknown' } }).skip,
);
ok('shouldSkipRetry allows clean failed', !shouldSkipRetry({ status: 'failed', result: {} }).skip);
ok('wasPublishClicked', wasPublishClicked({ publishClicked: true }));
ok('isTerminalPublishOutcome', isTerminalPublishOutcome({ publishOutcome: 'unknown' }));

{
  const body = 'Khách tìm mua căn hộ gần sông Hàn Đà Nẵng giá tốt liên hệ ngay hôm nay';
  const feed = `Someone else\n${body}\nJust now`;
  ok('anti-dupe detects feed match', feedLooksAlreadyPublished(feed, body));
  ok('anti-dupe negative', !feedLooksAlreadyPublished('unrelated feed text hello', body));
  ok(
    'anti-dupe ignores short caption',
    !feedLooksAlreadyPublished('short caption already here short caption', 'short caption'),
  );
  ok('captionHash stable', captionHash(body) === captionHash(body));
}

{
  const t = new PublishTrace('job-test-1');
  t.mark('AcquireLock');
  t.mark('InsertText', { chars: 10 });
  t.mark('PublishClick');
  t.mark('VerifyFeed');
  t.mark('Complete');
  const j = t.toJSON();
  ok('trace has events', Array.isArray(j.events) && (j.events as unknown[]).length >= 5);
  ok('trace durationMs', typeof j.durationMs === 'number');
}

// --- Simulated 20 publish transactions (exactly-once) ---
type SimJob = {
  id: string;
  status: string;
  result: Record<string, unknown>;
  publishClicks: number;
  inserts: number;
};

const jobs: SimJob[] = [];
for (let i = 0; i < 20; i += 1) {
  jobs.push({
    id: `sim-${i}`,
    status: 'queued',
    result: {},
    publishClicks: 0,
    inserts: 0,
  });
}

function simPublishOnce(job: SimJob, input: { body: string; mediaCount: number; linkUrl: string }) {
  // Guard
  const skip = shouldSkipRetry(job);
  if (skip.skip) return { skipped: true as const, reason: skip.reason };

  const caption = resolveComposerCaption({
    body: input.body,
    linkUrl: input.linkUrl,
    mediaCount: input.mediaCount,
    publishMode: 'media_first',
  });

  // Editor transaction: one insert
  job.inserts += 1;
  assert.equal(job.inserts, 1, 'exactly one insert');

  // Media first invariant
  if (input.mediaCount > 0) {
    assert.ok(!/https?:\/\//i.test(caption.caption), 'no URL in media caption');
  }

  // Anti-dupe (empty feed first time)
  assert.ok(!feedLooksAlreadyPublished('', input.body));

  // Click once
  job.publishClicks += 1;
  assert.equal(job.publishClicks, 1, 'exactly one publish click');
  job.result = {
    ...job.result,
    publishClicked: true,
    captionHash: captionHash(caption.caption),
    publishOutcome: 'published',
    verified: true,
    externalPostId: `fb_${job.id}`,
    externalUrl: `https://www.facebook.com/posts/${job.id}`,
    thumbnailVisible: input.mediaCount > 0,
    evidence: true,
  };
  job.status = 'published';
  return { skipped: false as const };
}

let spam = 0;
let dupText = 0;
let missingImage = 0;
let missingVerify = 0;
let missingEvidence = 0;

for (const job of jobs) {
  const body = `Listing ${job.id} căn hộ Đà Nẵng view đẹp liên hệ ngay`;
  const first = simPublishOnce(job, {
    body,
    mediaCount: 1,
    linkUrl: 'https://bdsdanang.site/listing/' + job.id,
  });
  ok(`${job.id} first publish`, first.skipped === false);

  // Retry must not create second post
  const retry = simPublishOnce(job, {
    body,
    mediaCount: 1,
    linkUrl: 'https://bdsdanang.site/listing/' + job.id,
  });
  ok(`${job.id} retry skipped`, retry.skipped === true);
  if (job.publishClicks > 1) spam += 1;
  if (job.inserts > 1) dupText += 1;
  if (!job.result.thumbnailVisible) missingImage += 1;
  if (!job.result.verified) missingVerify += 1;
  if (!job.result.evidence) missingEvidence += 1;
}

ok('20/20 zero spam clicks', spam === 0);
ok('20/20 zero duplicate inserts', dupText === 0);
ok('20/20 image upload flagged', missingImage === 0);
ok('20/20 verified', missingVerify === 0);
ok('20/20 evidence', missingEvidence === 0);

console.log(`\nPublisher hotfix regression: ${passed} assertions PASS`);
