#!/usr/bin/env tsx
/**
 * Automation Engine facade tests (no DB).
 * npm run test:automation-engine
 */
import assert from 'node:assert/strict';
import {
  AutomationEngine,
  WorkflowRegistry,
  ActionRegistry,
  DestinationRegistry,
  listAutomationWorkflows,
  isAutomationWorkflowImplemented,
  _resetAutomationWorkflowRegistryForTests,
} from '../server/modules/automation-engine';
import { PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY } from '../server/modules/mission-engine/domain/publishMissionTemplate';

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

console.log('Automation Engine — facade tests\n');

_resetAutomationWorkflowRegistryForTests();

await test('1. scan-content + publish-content registered and implemented', () => {
  assert.equal(isAutomationWorkflowImplemented('scan-content'), true);
  assert.equal(isAutomationWorkflowImplemented('publish-content'), true);
  const scan = WorkflowRegistry.get('scan-content');
  const publish = WorkflowRegistry.get('publish-content');
  assert.ok(scan);
  assert.ok(publish);
  assert.equal(scan!.kind, 'scan');
  assert.equal(publish!.kind, 'publish');
  assert.equal(publish!.missionTemplateKey, PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY);
  assert.equal(publish!.actionKey, 'publish');
});

await test('2. future workflows registered as stubs', () => {
  for (const key of [
    'auto-comment',
    'auto-message',
    'auto-follow',
    'auto-invite',
    'auto-react',
  ] as const) {
    const w = WorkflowRegistry.get(key);
    assert.ok(w, key);
    assert.equal(w!.implemented, false, key);
  }
});

await test('3. WorkflowRegistry.list returns all keys', () => {
  const list = listAutomationWorkflows();
  assert.equal(list.length, 7);
  assert.deepEqual(
    list.map(w => w.key),
    [
      'scan-content',
      'publish-content',
      'auto-comment',
      'auto-message',
      'auto-follow',
      'auto-invite',
      'auto-react',
    ],
  );
});

await test('4. AutomationEngine.resolveWorkflow enforces implemented', () => {
  const pub = AutomationEngine.resolveWorkflow('publish-content', {
    requireImplemented: true,
  });
  assert.equal(pub.key, 'publish-content');
  assert.throws(() =>
    AutomationEngine.resolveWorkflow('auto-comment', { requireImplemented: true }),
  );
});

await test('5. ActionRegistry + DestinationRegistry facades wired', () => {
  const actions = ActionRegistry.list();
  assert.ok(actions.some(a => a.key === 'publish'));
  assert.ok(actions.some(a => a.key === 'comment'));
  const destinations = DestinationRegistry.list();
  assert.ok(destinations.some(d => d.key === 'facebook_timeline'));
});

await test('6. AutomationEngine.describe() includes runtimes + registries', () => {
  const snap = AutomationEngine.describe();
  assert.equal(snap.name, 'AutomationEngine');
  assert.ok(snap.runtimes.mission.includes('mission-engine'));
  assert.ok(snap.runtimes.worker.includes('agent-worker'));
  assert.ok(snap.registries.workflows.some(w => w.key === 'scan-content' && w.implemented));
  assert.ok(snap.registries.workflows.some(w => w.key === 'publish-content' && w.implemented));
  assert.ok(snap.registries.actions.length >= 1);
  assert.ok(snap.registries.destinations.length >= 1);
});

await test('7. only two workflows implemented today', () => {
  const impl = WorkflowRegistry.listImplemented();
  assert.equal(impl.length, 2);
  assert.deepEqual(
    impl.map(w => w.key).sort(),
    ['publish-content', 'scan-content'],
  );
});

if (!process.exitCode) {
  console.log(`\n${passed} tests passed`);
}
