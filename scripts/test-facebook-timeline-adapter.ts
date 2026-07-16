import assert from 'node:assert/strict';
import { FacebookTimelineAdapter } from '../server/modules/social-publishing/browser/adapters/facebookTimelineAdapter';

async function main() {
  const adapter = new FacebookTimelineAdapter();
  const ctx = {
    publishJobId: 'job_timeline_test',
    draftId: 'draft_timeline_test',
    destinationId: 'destination_timeline_test',
    missionRunId: 'mission_timeline_test',
    body: 'Timeline adapter dry-run post',
    linkUrl: 'https://example.com',
    media: [],
    destinationConfig: {},
    dryRun: true,
  };

  const prepared = await adapter.prepare(ctx);
  assert.equal(prepared.ok, true);

  const auth = await adapter.ensureAuthenticated(ctx);
  assert.equal(auth.ok, true);

  const nav = await adapter.navigate(ctx);
  assert.equal(nav.ok, true);

  const upload = await adapter.uploadMedia(ctx);
  assert.equal(upload.ok, true);

  const compose = await adapter.fillContent(ctx);
  assert.equal(compose.ok, true);

  const publish = await adapter.publish(ctx);
  assert.equal(publish.ok, true);

  const verify = await adapter.verify(ctx);
  assert.equal(verify.ok, true);

  const evidence = await adapter.captureEvidence(ctx);
  assert.ok(typeof evidence.durationMs === 'number');
  assert.ok(evidence.screenshotBeforePath);
  assert.ok(evidence.screenshotAfterPath);

  const cleanup = await adapter.cleanup(ctx);
  assert.equal(cleanup.ok, true);

  console.log('PASS test-facebook-timeline-adapter');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
