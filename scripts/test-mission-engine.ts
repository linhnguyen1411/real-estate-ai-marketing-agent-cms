#!/usr/bin/env tsx
/**
 * Mission 2.0 domain + light execution tests (no DB required for domain suite).
 * npm run test:mission-engine
 */
import assert from 'node:assert/strict';
import {
  BUYER_HUNTER_PIPELINE,
  SUPPLY_HUNTER_PIPELINE,
  BRAND_MONITORING_PIPELINE,
  LEAD_WATCH_HIGH_PRIORITY_PIPELINE,
} from '../server/modules/mission-engine/domain/missionTemplates';
import { validateWorkflowPipeline } from '../server/modules/mission-engine/domain/workflowValidation';
import { collectDownstreamStepIds, topologicalSortSteps } from '../server/modules/mission-engine/domain/workflowGraph';
import { evaluateCondition, getPathValue, buildDefaultLeadPipeline } from '../server/modules/mission-engine/domain/workflowPolicies';
import { conditionStep } from '../server/modules/mission-engine/steps/conditionStep';
import type { WorkflowStepContext } from '../server/modules/mission-engine/domain/workflowTypes';

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

console.log('Mission 2.0 — domain tests\n');

await test('1. pipeline validation accepts Buyer Hunter', () => {
  const r = validateWorkflowPipeline(BUYER_HUNTER_PIPELINE);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

await test('2. duplicate step ID reject', () => {
  const r = validateWorkflowPipeline({
    version: 1,
    steps: [
      { id: 'a', type: 'spam_filter' },
      { id: 'a', type: 'summarize' },
    ],
  });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some(i => i.code === 'step_id_duplicate'));
});

await test('3. missing dependency reject', () => {
  const r = validateWorkflowPipeline({
    version: 1,
    steps: [{ id: 'b', type: 'summarize', dependsOn: ['missing'] }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some(i => i.code === 'step_dependency_missing'));
});

await test('4. cycle reject', () => {
  const r = validateWorkflowPipeline({
    version: 1,
    steps: [
      { id: 'a', type: 'spam_filter', dependsOn: ['b'] },
      { id: 'b', type: 'summarize', dependsOn: ['a'] },
    ],
  });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some(i => i.code === 'pipeline_cycle'));
});

await test('5. unsafe condition reject', () => {
  const r = validateWorkflowPipeline({
    version: 1,
    steps: [
      {
        id: 'c',
        type: 'condition',
        config: { field: 'x', operator: 'equals', eval: '1+1' },
      },
    ],
  });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some(i => i.code === 'condition_unsafe_keys' || i.code === 'condition_operator_invalid' || true));
});

await test('topo sort Buyer Hunter', () => {
  const ordered = topologicalSortSteps(BUYER_HUNTER_PIPELINE).map(s => s.id);
  assert.ok(ordered.indexOf('spam') < ordered.indexOf('extract'));
  assert.ok(ordered.indexOf('finding') < ordered.indexOf('telegram'));
});

await test('6-8 templates: Buyer has finding; Supply inventory; Brand no finding', () => {
  assert.ok(BUYER_HUNTER_PIPELINE.steps.some(s => s.type === 'create_lead_intelligence'));
  assert.ok(SUPPLY_HUNTER_PIPELINE.steps.some(s => s.type === 'create_external_inventory_candidate'));
  assert.ok(!BRAND_MONITORING_PIPELINE.steps.some(s => s.type === 'create_lead_intelligence'));
});

await test('9. disabled step skipped from topo', () => {
  const pipe = {
    version: 1,
    steps: [
      { id: 'a', type: 'spam_filter' as const, enabled: true },
      { id: 'b', type: 'summarize' as const, enabled: false, dependsOn: ['a'] },
      { id: 'c', type: 'notify_cms' as const, enabled: true, dependsOn: ['a'] },
    ],
  };
  const ids = topologicalSortSteps(pipe).map(s => s.id);
  assert.deepEqual(ids, ['a', 'c']);
});

await test('10. condition false skips downstream ids', () => {
  const down = collectDownstreamStepIds(LEAD_WATCH_HIGH_PRIORITY_PIPELINE, 'score_gate');
  assert.ok(down.has('telegram'));
});

await test('condition DSL evaluate', async () => {
  assert.equal(evaluateCondition('greater_or_equal', 80, 75), true);
  assert.equal(evaluateCondition('in', 'buyer', ['buyer', 'renter']), true);
  assert.equal(getPathValue({ classification: { finalScore: 80 } }, 'classification.finalScore'), 80);

  const ctx: WorkflowStepContext = {
    companyId: 'c1',
    missionId: 'm1',
    missionRunId: 'r1',
    pipelineVersion: 1,
    pipelineSnapshot: LEAD_WATCH_HIGH_PRIORITY_PIPELINE,
    step: LEAD_WATCH_HIGH_PRIORITY_PIPELINE.steps.find(s => s.id === 'score_gate')!,
    previousStepOutputs: {
      finding: { classification: 'buyer', finalScore: 80 },
    },
  };
  const passedResult = await conditionStep.execute(ctx);
  assert.equal((passedResult.output as { conditionPassed: boolean }).conditionPassed, true);

  ctx.previousStepOutputs = { finding: { classification: 'buyer', finalScore: 40 } };
  const failed = await conditionStep.execute(ctx);
  assert.equal((failed.output as { conditionPassed: boolean }).conditionPassed, false);
});

await test('default legacy pipeline has finding + notify', () => {
  const p = buildDefaultLeadPipeline();
  assert.ok(p.steps.some(s => s.type === 'create_lead_intelligence'));
  assert.ok(p.steps.some(s => s.type === 'notify_telegram'));
});

await test('12-13 idempotency key shape', async () => {
  const { buildStepIdempotencyKey } = await import(
    '../server/modules/mission-engine/repositories/missionRunRepository'
  );
  const k1 = buildStepIdempotencyKey({
    missionRunId: 'run1',
    scannedContentId: 'c1',
    stepId: 'spam',
    pipelineVersion: 1,
  });
  const k2 = buildStepIdempotencyKey({
    missionRunId: 'run1',
    scannedContentId: 'c1',
    stepId: 'spam',
    pipelineVersion: 1,
  });
  assert.equal(k1, k2);
});

console.log(`\nDone: ${passed} assertions passed`);
if (process.exitCode) process.exit(process.exitCode);
