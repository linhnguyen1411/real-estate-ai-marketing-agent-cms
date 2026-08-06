/**
 * Browser Action Framework tests (dry-run).
 * Run: npx tsx scripts/test-browser-actions.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  AUTOMATION_ACTION_KEYS,
  _resetAutomationActionRegistryForTests,
  getAutomationActionRegistration,
  isAutomationActionImplemented,
  listAutomationActions,
  suggestComment,
  suggestReply,
  suggestMessage,
  suggestBrowserAction,
} from '../server/modules/social-publishing/browser/actions';
import { FacebookTimelineAdapter } from '../server/modules/social-publishing/browser/adapters/facebookTimelineAdapter';
import { workflowStepHandlers } from '../server/modules/mission-engine/steps';
import type { WorkflowStepContext } from '../server/modules/mission-engine/domain/workflowTypes';

const INTERACTION_KEYS = AUTOMATION_ACTION_KEYS.filter(k => k !== 'publish') as Array<
  Exclude<(typeof AUTOMATION_ACTION_KEYS)[number], 'publish'>
>;

function baseCtx(overrides: Record<string, unknown> = {}) {
  return {
    publishJobId: 'job_browser_actions',
    draftId: 'draft_browser_actions',
    destinationId: 'dest_browser_actions',
    missionRunId: 'mr_browser_actions',
    body: 'Hello from action framework',
    linkUrl: null,
    media: [],
    destinationConfig: {
      humanApproved: true,
      actionText: 'Hello from action framework',
      reaction: 'Like',
      targetUrl: 'https://www.facebook.com/',
      ...overrides,
    },
    dryRun: true,
  };
}

function missionCtx(
  stepType: string,
  config: Record<string, unknown>,
  prev: Record<string, unknown> = {},
): WorkflowStepContext {
  return {
    companyId: null,
    missionId: 'mission_browser_actions',
    missionRunId: 'mr_browser_actions',
    pipelineVersion: 1,
    pipelineSnapshot: { version: 1, steps: [] },
    step: {
      id: `step_${stepType}`,
      type: stepType as WorkflowStepContext['step']['type'],
      config,
    },
    previousStepOutputs: prev,
  };
}

async function runLifecycle(
  adapter: FacebookTimelineAdapter,
  key: (typeof INTERACTION_KEYS)[number],
  label: string,
) {
  const action = adapter.getAction(key);
  assert.ok(action, `${label}: action bound`);
  const ctx = baseCtx();
  assert.equal((await action.prepare(ctx)).ok, true, `${label} prepare`);
  const exec = await action.execute(ctx);
  assert.equal(exec.ok, true, `${label} execute: ${exec.message || ''}`);
  assert.equal((await action.verify(ctx)).ok, true, `${label} verify`);
  const evidence = await action.captureEvidence(ctx);
  assert.ok(typeof evidence.durationMs === 'number', `${label} duration`);
  assert.ok(evidence.screenshotBeforePath, `${label} screenshot before`);
  assert.ok(evidence.screenshotAfterPath, `${label} screenshot after`);
  assert.ok(evidence.htmlSnapshotPath, `${label} html`);
  assert.equal(evidence.result, 'success', `${label} result`);
  assert.equal((await action.cleanup(ctx)).ok, true, `${label} cleanup`);
  console.log(`PASS ${label}`);
}

async function main() {
  _resetAutomationActionRegistryForTests();
  const adapter = new FacebookTimelineAdapter();

  const regs = listAutomationActions();
  assert.equal(regs.length, AUTOMATION_ACTION_KEYS.length);

  for (const key of AUTOMATION_ACTION_KEYS) {
    assert.equal(isAutomationActionImplemented(key), true, `${key} implemented`);
    assert.ok(getAutomationActionRegistration(key)?.implemented, `${key} registration`);
  }

  // Comment / Reply / React / Message / Follow / JoinGroup / Invite
  await runLifecycle(adapter, 'comment', 'Comment');
  await runLifecycle(adapter, 'reply', 'Reply');
  await runLifecycle(adapter, 'react', 'React');
  await runLifecycle(adapter, 'message', 'Message');
  await runLifecycle(adapter, 'follow', 'Follow');
  await runLifecycle(adapter, 'join_group', 'JoinGroup');
  await runLifecycle(adapter, 'invite', 'Invite');

  // Publish unchanged
  const publish = adapter.getPublishAction();
  const pubCtx = baseCtx();
  assert.equal((await publish.prepare(pubCtx)).ok, true);
  assert.equal((await publish.execute(pubCtx)).ok, true);
  assert.equal((await publish.verify(pubCtx)).ok, true);
  await publish.captureEvidence(pubCtx);
  assert.equal((await publish.cleanup(pubCtx)).ok, true);
  console.log('PASS Publishing');

  // Human approval required (no auto execute)
  const comment = adapter.getAction('comment')!;
  const blockedCtx = {
    ...baseCtx(),
    destinationConfig: {
      actionText: 'x',
      requireApproval: true,
    } as Record<string, unknown>,
  };
  const blocked = await comment.execute(blockedCtx);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.message, 'human_approval_required');
  assert.equal(blocked.data?.autoExecute, false);

  // AI suggestions never auto-execute
  const sug = suggestComment({ topic: 'listing', draftText: 'Nice place' });
  assert.equal(sug.requiresHumanApproval, true);
  assert.equal(sug.autoExecute, false);
  assert.equal(suggestReply({ draftText: 'Thanks' }).autoExecute, false);
  assert.equal(suggestMessage({ draftText: 'Hi' }).autoExecute, false);
  assert.equal(suggestBrowserAction({ intent: 'follow' }).autoExecute, false);

  // Mission path: suggest → action (with approval)
  const suggestHandler = workflowStepHandlers.get('browser_suggest_action');
  const actionHandler = workflowStepHandlers.get('browser_action');
  assert.ok(suggestHandler && actionHandler, 'mission handlers registered');

  const suggestOut = await suggestHandler.execute(
    missionCtx('browser_suggest_action', {
      action: 'comment',
      topic: 'villa',
      draftText: 'Interested in this villa',
    }),
  );
  assert.equal(suggestOut.status, 'completed');
  const suggestPayload = suggestOut.output as Record<string, unknown>;
  assert.equal(suggestPayload.autoExecute, false);
  assert.equal(suggestPayload.humanApproved, false);

  const actionOut = await actionHandler.execute(
    missionCtx(
      'browser_action',
      {
        action: 'comment',
        destinationKey: 'facebook_timeline',
        dryRun: true,
        actionText: 'Interested in this villa',
        humanApproved: true,
      },
      { humanApproved: true },
    ),
  );
  assert.equal(actionOut.status, 'completed');
  const actionPayload = actionOut.output as Record<string, unknown>;
  assert.equal(actionPayload.ok, true);
  assert.equal(actionPayload.autoExecute, false);
  console.log('PASS Mission');

  // Evidence files exist for last comment run
  const evidence = actionPayload.evidence as {
    screenshotBeforePath?: string;
    htmlSnapshotPath?: string;
  };
  if (evidence?.htmlSnapshotPath) {
    await fs.access(evidence.htmlSnapshotPath);
  }

  console.log('\nBROWSER ACTIONS TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
