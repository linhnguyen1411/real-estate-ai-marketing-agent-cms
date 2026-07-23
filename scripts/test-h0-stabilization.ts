/**
 * H0 — Publish schedule path + job ownership contract checks (no live Facebook).
 * Run: npx tsx scripts/test-h0-stabilization.ts
 */
import assert from 'node:assert/strict';
import {
  buildJobOwnership,
  mergeOwnershipIntoPayload,
  clearOwnershipFromPayload,
  isOwnedByOther,
} from '../server/modules/control-plane/fleet-orchestrator/jobOwnership';
import { FACEBOOK_PUBLISH_MATURITY } from '../server/modules/social-publishing/browser/capabilities';
import { validateMime } from '../server/modules/social-publishing/mediaValidation';
import { createCommandEngine } from '../server/modules/control-plane/command-engine';
import { consoleSystemUser } from '../server/modules/control-plane/command-engine/defaultCommands';

async function main() {
  console.log('=== H0 Stabilization Checks ===\n');

  // Ownership
  const ownership = buildJobOwnership({
    agentId: 'worker-A',
    machineId: 'LINH-PC',
    hostname: 'LINH-PC',
    decision: {
      score: 88,
      reasons: ['caps_ok', 'affinity_host'],
      policyMode: 'spread',
      rejected: [{ jobId: 'x', reason: 'cooldown' }],
      breakdown: { capability: 30, browser: 10, load: 20, affinity: 20, priority: 8, policy: 0, total: 88 },
    },
  });
  assert.equal(ownership.ownerAgent, 'worker-A');
  assert.equal(ownership.ownerMachine, 'LINH-PC');
  assert.ok(ownership.leaseUntil);
  assert.ok(ownership.plannerDecision.score === 88);
  const payload = mergeOwnershipIntoPayload({ publishJobId: 'pj1' }, ownership);
  assert.equal(payload.publishJobId, 'pj1');
  assert.equal(isOwnedByOther(payload, 'worker-B'), true);
  assert.equal(isOwnedByOther(payload, 'worker-A'), false);
  const cleared = clearOwnershipFromPayload(payload);
  assert.equal(cleared.ownerAgent, undefined);
  assert.equal(cleared.publishJobId, 'pj1');
  console.log('Job Ownership PASS');

  // Facebook maturity
  assert.equal(FACEBOOK_PUBLISH_MATURITY.timeline, 'stable');
  assert.equal(FACEBOOK_PUBLISH_MATURITY.multiImage, 'stable');
  assert.equal(FACEBOOK_PUBLISH_MATURITY.video, 'experimental');
  assert.equal(validateMime('video/mp4').ok, false);
  assert.ok(/Experimental/i.test(validateMime('video/mp4').error || ''));
  assert.equal(validateMime('image/jpeg').ok, true);
  console.log('Facebook Publish Audit PASS');

  // Telegram fleet still works
  const engine = createCommandEngine();
  const fleet = await engine.execute('/fleet planner', {
    user: consoleSystemUser(null, 'cli'),
    client: 'cli',
    triggeredBy: 'h0',
  });
  assert.equal(fleet.ok, true);
  console.log('Fleet / Telegram PASS');

  console.log('\nH0 STABILIZATION CHECKS PASS');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
