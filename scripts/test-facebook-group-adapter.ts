#!/usr/bin/env tsx
/**
 * Facebook Group browser publisher tests (dry-run + config helpers).
 * npm run test:facebook-group
 */
import assert from 'node:assert/strict';
import {
  FacebookGroupAdapter,
  extractFacebookGroupPermalink,
  extractFacebookGroupPostId,
  localMediaPaths,
  resolveFacebookGroupUrl,
} from '../server/modules/social-publishing/browser/adapters/facebookGroupAdapter';
import {
  FacebookTimelineAdapter,
  extractFacebookPermalink,
} from '../server/modules/social-publishing/browser/adapters/facebookTimelineAdapter';
import {
  _resetDestinationRegistryForTests,
  resolveDestinationAdapter,
} from '../server/modules/social-publishing/browser/destinationRegistry';

let passed = 0;
function ok(name: string) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name: string, err: unknown) {
  console.error(`  ✗ ${name}`);
  console.error(err);
  process.exitCode = 1;
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

console.log('Facebook Group — publisher tests\n');

await test('1. resolveFacebookGroupUrl from groupUrl', () => {
  assert.equal(
    resolveFacebookGroupUrl({ groupUrl: 'https://www.facebook.com/groups/123/' }),
    'https://www.facebook.com/groups/123/',
  );
});

await test('2. resolveFacebookGroupUrl throws when missing', () => {
  assert.throws(() => resolveFacebookGroupUrl({}), /missing groupUrl/);
});

await test('3. group permalink /posts extraction', () => {
  const r = extractFacebookGroupPermalink({
    hrefs: ['https://www.facebook.com/groups/999/posts/555666777888'],
  });
  assert.equal(r.postId, '555666777888');
  assert.ok(r.permalink?.includes('/groups/999/posts/'));
});

await test('4. extractFacebookGroupPostId', () => {
  assert.equal(
    extractFacebookGroupPostId('https://www.facebook.com/groups/abc/posts/112233'),
    '112233',
  );
});

await test('5. dry-run full group publish lifecycle', async () => {
  const adapter = new FacebookGroupAdapter();
  const ctx = {
    publishJobId: 'job_group_live',
    draftId: 'draft_group_live',
    destinationId: 'destination_group_live',
    missionRunId: 'mission_group_live',
    body: 'Group live dry-run post',
    linkUrl: 'https://example.com/listing',
    media: [
      { type: 'image', fileUrl: '/tmp/g1.jpg', sortOrder: 0 },
      { type: 'image', fileUrl: '/tmp/g2.jpg', sortOrder: 1 },
    ],
    destinationConfig: {
      groupUrl: 'https://www.facebook.com/groups/123456789/',
    },
    dryRun: true,
  };

  assert.equal(adapter.initialUrl(ctx), 'https://www.facebook.com/groups/123456789/');
  assert.equal((await adapter.prepare(ctx)).ok, true);
  assert.equal((await adapter.ensureAuthenticated(ctx)).ok, true);
  assert.equal((await adapter.navigate(ctx)).ok, true);

  const upload = await adapter.uploadMedia(ctx);
  assert.equal(upload.ok, true);
  assert.equal(upload.data?.mediaCount, 2);

  assert.equal((await adapter.fillContent(ctx)).ok, true);
  const publish = await adapter.publish(ctx);
  assert.equal(publish.ok, true);
  assert.ok(typeof publish.data?.publishedUrl === 'string');
  assert.equal((await adapter.verify(ctx)).ok, true);

  const evidence = await adapter.captureEvidence(ctx);
  assert.ok(typeof evidence.durationMs === 'number');
  assert.ok(evidence.screenshotBeforePath);
  assert.equal((await adapter.cleanup(ctx)).ok, true);
});

await test('6. registry resolves live group adapter (not stub)', () => {
  _resetDestinationRegistryForTests();
  const adapter = resolveDestinationAdapter('facebook_group');
  assert.equal(adapter.key, 'facebook_group');
  assert.ok(adapter instanceof FacebookGroupAdapter);
});

await test('7. timeline still works alongside group', async () => {
  const timeline = new FacebookTimelineAdapter();
  const ctx = {
    publishJobId: 'job_timeline_parity',
    draftId: 'draft_timeline_parity',
    destinationId: 'dest_timeline_parity',
    missionRunId: 'mr_timeline_parity',
    body: 'timeline parity',
    linkUrl: null,
    media: [],
    destinationConfig: {},
    dryRun: true,
  };
  assert.equal((await timeline.prepare(ctx)).ok, true);
  assert.equal((await timeline.publish(ctx)).ok, true);
  assert.equal((await timeline.cleanup(ctx)).ok, true);

  const permalink = extractFacebookPermalink({
    hrefs: ['https://www.facebook.com/user/posts/999888777'],
  });
  assert.equal(permalink.postId, '999888777');
});

await test('8. localMediaPaths still filters remote', () => {
  assert.deepEqual(
    localMediaPaths([
      { fileUrl: '/a.jpg' },
      { fileUrl: 'https://cdn.example.com/b.jpg' },
    ]),
    ['/a.jpg'],
  );
});

await test('9. group adapter uses DomToolkit (no Timeline import)', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(
    new URL(
      '../server/modules/social-publishing/browser/adapters/facebookGroupAdapter.ts',
      import.meta.url,
    ),
    'utf8',
  );
  assert.equal(/facebookTimelineAdapter|facebookTimelineDom|facebookTimelineConfig/i.test(src), false);
  assert.ok(src.includes('DomConfiguredDestinationAdapter'));
  assert.ok(src.includes('FACEBOOK_GROUP_DOM'));
});

if (!process.exitCode) {
  console.log(`\n${passed} tests passed`);
}
