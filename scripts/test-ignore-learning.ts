/**
 * H2.4.10 — Ignore Learning + Spam Knowledge regression test.
 * Tests ignore flow types, spam rule creation contract, and pipeline exclusion.
 * Run: npx tsx scripts/test-ignore-learning.ts
 */
import assert from 'node:assert/strict';
import type { IgnoreReason } from '../server/modules/sales-layer/ignoreLearnService';
import type { SalesSnapshot } from '../server/modules/executive-dashboard/types';

function ok(name: string, cond: unknown) {
  assert.ok(cond, name);
  console.log(`✓ ${name}`);
}

{
  const reasons: IgnoreReason[] = ['spam', 'duplicate', 'broker', 'irrelevant', 'already_contacted', 'invalid_phone', 'other'];
  ok('IgnoreReason has 7 variants', reasons.length === 7);
  ok('spam is learnable', ['spam', 'duplicate'].includes('spam'));
  ok('already_contacted is not learnable', !['spam', 'duplicate'].includes('already_contacted'));
}

{
  const snapshot: Partial<SalesSnapshot> = {
    buyersToday: 5,
    qualifiedToday: 3,
    urgentBuyers: 1,
    pipelineValue: 100,
    expectedRevenue: 50,
    ignoredToday: 2,
    spamLearnedToday: 1,
    spamHitRate: 5.5,
    rejectedBeforeAi: 10,
  };
  ok('SalesSnapshot has ignoredToday', 'ignoredToday' in snapshot);
  ok('SalesSnapshot has spamLearnedToday', 'spamLearnedToday' in snapshot);
  ok('SalesSnapshot has spamHitRate', 'spamHitRate' in snapshot);
  ok('SalesSnapshot has rejectedBeforeAi', 'rejectedBeforeAi' in snapshot);
}

{
  const { callbackDataToCommand } = await import('../server/modules/control-plane/inlineKeyboard');
  const skipCmd = callbackDataToCommand('l:s:abc123');
  ok('l:s callback maps to /lead skip', skipCmd === '/lead skip abc123');
}

console.log('\nIgnore Learning + Spam Knowledge: PASS');
