#!/usr/bin/env tsx
/**
 * Facebook Timeline live adapter tests (dry-run + pure helpers).
 * npm run test:facebook-timeline
 */
import assert from 'node:assert/strict';
import {
  FacebookTimelineAdapter,
  extractFacebookPermalink,
  extractPostIdFromUrl,
  localMediaPaths,
} from '../server/modules/social-publishing/browser/adapters/facebookTimelineAdapter';
import {
  PUBLISH_BROWSER_CONTENT_PIPELINE,
  isBrowserPublishPipeline,
} from '../server/modules/mission-engine/domain/publishMissionTemplate';
import { validateWorkflowPipeline } from '../server/modules/mission-engine/domain/workflowValidation';
import { workflowStepHandlers } from '../server/modules/mission-engine/steps';

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

console.log('Facebook Timeline — live adapter tests\n');

await test('1. permalink extraction from posts URL', () => {
  const r = extractFacebookPermalink({
    currentUrl: 'https://www.facebook.com/me',
    hrefs: ['https://www.facebook.com/user/posts/123456789012345'],
  });
  assert.equal(r.postId, '123456789012345');
  assert.ok(r.permalink?.includes('/posts/123456789012345'));
});

await test('2. permalink extraction from story_fbid', () => {
  const r = extractFacebookPermalink({
    html: '<a href="https://www.facebook.com/story.php?story_fbid=987654321&amp;id=1">x</a>',
  });
  assert.equal(r.postId, '987654321');
  assert.ok(r.permalink);
});

await test('3. extractPostIdFromUrl', () => {
  assert.equal(
    extractPostIdFromUrl('https://www.facebook.com/permalink.php?story_fbid=111&id=2'),
    '111',
  );
});

await test('4. localMediaPaths filters remote URLs', () => {
  const paths = localMediaPaths([
    { fileUrl: 'C:\\\\tmp\\\\a.jpg' },
    { fileUrl: 'https://cdn.example.com/b.jpg' },
    { fileUrl: '/runtime/media/c.png' },
  ]);
  assert.equal(paths.length, 2);
  assert.ok(paths.includes('C:\\\\tmp\\\\a.jpg'));
  assert.ok(paths.includes('/runtime/media/c.png'));
});

await test('5. dry-run full timeline publish lifecycle', async () => {
  const adapter = new FacebookTimelineAdapter();
  const ctx = {
    publishJobId: 'job_timeline_live',
    draftId: 'draft_timeline_live',
    destinationId: 'destination_timeline_live',
    missionRunId: 'mission_timeline_live',
    body: 'Timeline live dry-run post',
    linkUrl: 'https://example.com/listing',
    media: [
      { type: 'image', fileUrl: '/tmp/one.jpg', sortOrder: 0 },
      { type: 'image', fileUrl: '/tmp/two.jpg', sortOrder: 1 },
      { type: 'image', fileUrl: 'https://cdn.example.com/skip.jpg', sortOrder: 2 },
    ],
    destinationConfig: {},
    dryRun: true,
  };

  assert.equal((await adapter.prepare(ctx)).ok, true);
  assert.equal((await adapter.ensureAuthenticated(ctx)).ok, true);
  assert.equal((await adapter.navigate(ctx)).ok, true);

  const upload = await adapter.uploadMedia(ctx);
  assert.equal(upload.ok, true);
  assert.equal(upload.data?.mediaCount, 2);

  const compose = await adapter.fillContent(ctx);
  assert.equal(compose.ok, true);

  const publish = await adapter.publish(ctx);
  assert.equal(publish.ok, true);
  assert.ok(typeof publish.data?.publishedUrl === 'string');

  const verify = await adapter.verify(ctx);
  assert.equal(verify.ok, true);

  const evidence = await adapter.captureEvidence(ctx);
  assert.ok(typeof evidence.durationMs === 'number');
  assert.ok(evidence.screenshotBeforePath);
  assert.ok(evidence.screenshotAfterPath);
  assert.ok(evidence.publishedUrl);

  assert.equal((await adapter.cleanup(ctx)).ok, true);
});

await test('6. publish workflow pipeline still valid', () => {
  assert.equal(isBrowserPublishPipeline(PUBLISH_BROWSER_CONTENT_PIPELINE), true);
  const validation = validateWorkflowPipeline(PUBLISH_BROWSER_CONTENT_PIPELINE);
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  for (const step of PUBLISH_BROWSER_CONTENT_PIPELINE.steps) {
    assert.ok(workflowStepHandlers.has(step.type), `missing handler ${step.type}`);
  }
});

await test('7. no Graph API imports in timeline adapter module', async () => {
  const fs = await import('node:fs/promises');
  const adapterSrc = await fs.readFile(
    new URL(
      '../server/modules/social-publishing/browser/adapters/facebookTimelineAdapter.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const domSrc = await fs.readFile(
    new URL(
      '../server/modules/social-publishing/browser/adapters/facebookTimelineDom.ts',
      import.meta.url,
    ),
    'utf8',
  );
  assert.equal(/graphApi|graph\.facebook|facebookPageGraph/i.test(adapterSrc), false);
  assert.equal(/graphApi|graph\.facebook|facebookPageGraph/i.test(domSrc), false);
});

if (!process.exitCode) {
  console.log(`\n${passed} tests passed`);
}
