/**
 * Action Framework registration + PublishAction + interaction actions wiring tests.
 * Run: npx tsx scripts/test-automation-action-framework.ts
 */
import assert from 'node:assert/strict';
import {
  AUTOMATION_ACTION_KEYS,
  _resetAutomationActionRegistryForTests,
  getAutomationActionRegistration,
  isAutomationActionImplemented,
  listAutomationActions,
} from '../server/modules/social-publishing/browser/actions';
import { FacebookTimelineAdapter } from '../server/modules/social-publishing/browser/adapters/facebookTimelineAdapter';

async function main() {
  _resetAutomationActionRegistryForTests();

  // Construct destination → registers PublishAction + interaction actions
  const adapter = new FacebookTimelineAdapter();
  const regs = listAutomationActions();
  assert.equal(regs.length, AUTOMATION_ACTION_KEYS.length, 'all action keys registered');

  for (const key of AUTOMATION_ACTION_KEYS) {
    const reg = getAutomationActionRegistration(key);
    assert.ok(reg, `missing registration: ${key}`);
    assert.equal(isAutomationActionImplemented(key), true, `${key} must be implemented`);
  }

  const publishAction = adapter.getPublishAction();
  assert.equal(publishAction.key, 'publish');

  const ctx = {
    publishJobId: 'job_action_fw',
    draftId: 'draft_action_fw',
    destinationId: 'dest_action_fw',
    missionRunId: 'mr_action_fw',
    body: 'Action framework dry-run',
    linkUrl: null,
    media: [],
    destinationConfig: { humanApproved: true },
    dryRun: true,
  };

  // Publish still runs through Action Framework lifecycle
  assert.equal((await publishAction.prepare(ctx)).ok, true);
  assert.equal((await publishAction.execute(ctx)).ok, true);
  assert.equal((await publishAction.verify(ctx)).ok, true);
  const evidence = await publishAction.captureEvidence(ctx);
  assert.ok(typeof evidence.durationMs === 'number');
  assert.equal((await publishAction.cleanup(ctx)).ok, true);

  // Adapter facade still works (workflow compatibility)
  assert.equal((await adapter.prepare(ctx)).ok, true);
  assert.equal((await adapter.uploadMedia(ctx)).ok, true);
  assert.equal((await adapter.fillContent(ctx)).ok, true);
  assert.equal((await adapter.publish(ctx)).ok, true);

  // Comment action is implemented (dry-run)
  const comment = adapter.getAction('comment')!;
  assert.equal(comment.key, 'comment');
  const commentCtx = {
    ...ctx,
    publishJobId: 'job_action_fw_comment',
    destinationConfig: { humanApproved: true, actionText: 'Nice listing' },
  };
  assert.equal((await comment.prepare(commentCtx)).ok, true);
  assert.equal((await comment.execute(commentCtx)).ok, true);
  assert.equal((await comment.verify(commentCtx)).ok, true);
  await comment.captureEvidence(commentCtx);
  assert.equal((await comment.cleanup(commentCtx)).ok, true);

  console.log('PASS test-automation-action-framework');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
