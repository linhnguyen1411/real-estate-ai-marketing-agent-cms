#!/usr/bin/env node
/**
 * Agent sync outbox — status constants + backoff + envelope helpers (no DB).
 */
import assert from 'assert';
import {
  OUTBOX_STATUSES,
  backoffMs,
  enqueueFindingSync,
  processOutboxBatch,
  getSyncOutboxStats,
} from '../server/agentSync/outboxService';
import {
  AGENT_INGEST_API_VERSION,
  syncIdempotencyKey,
  isLocalSyncEnabled,
} from '../server/agentSync/envelope';
import {
  enqueueScannedContentSync,
  enqueueFindingUpsertSync,
  shouldEnqueueSync,
} from '../server/agentSync/enqueue';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

{
  ok('smoke: enqueueFindingSync is a function', typeof enqueueFindingSync === 'function');
  ok('smoke: processOutboxBatch is a function', typeof processOutboxBatch === 'function');
  ok('smoke: getSyncOutboxStats is a function', typeof getSyncOutboxStats === 'function');
  ok('smoke: enqueueScannedContentSync is a function', typeof enqueueScannedContentSync === 'function');
  ok('smoke: enqueueFindingUpsertSync is a function', typeof enqueueFindingUpsertSync === 'function');
  ok('smoke: shouldEnqueueSync is a function', typeof shouldEnqueueSync === 'function');
}

{
  ok('has pending', OUTBOX_STATUSES.includes('pending'));
  ok('has sending', OUTBOX_STATUSES.includes('sending'));
  ok('has synced', OUTBOX_STATUSES.includes('synced'));
  ok('has failed', OUTBOX_STATUSES.includes('failed'));
  ok('has dead_letter', OUTBOX_STATUSES.includes('dead_letter'));
  ok('exactly 5 statuses', OUTBOX_STATUSES.length === 5);
}

{
  ok('backoff attempt 0 = 30s', backoffMs(0) === 30_000);
  ok('backoff attempt 1 = 60s', backoffMs(1) === 60_000);
  ok('backoff attempt 2 = 120s', backoffMs(2) === 120_000);
  ok('backoff attempt 6 = 30s * 2^6', backoffMs(6) === 30_000 * 64);
  ok('backoff caps at attempt 6', backoffMs(99) === backoffMs(6));
  ok('backoff floors negative at 0', backoffMs(-3) === backoffMs(0));
}

{
  ok('apiVersion v1', AGENT_INGEST_API_VERSION === 'v1');
  ok(
    'idempotency key stable',
    syncIdempotencyKey(['content', 'comp', 'src', 'hash', 'v1']) ===
      'content:comp:src:hash:v1',
  );
  ok('isLocalSyncEnabled is boolean', typeof isLocalSyncEnabled() === 'boolean');
}

console.log(`\n${passed} assertions passed`);
