#!/usr/bin/env node
/**
 * Sprint 6.1 — Scheduler duplicate-prevention unit tests (no DB / no browser).
 * Run: npm run test:agent-scheduler
 */
import {
  computeNextScanAt,
  shouldEnqueueSourceScan,
} from '../server/agent/agentScheduler.ts';

let passed = 0;
let failed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, error) {
  failed += 1;
  console.error(`  ✗ ${label}`);
  console.error('   ', error instanceof Error ? error.message : error);
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail || 'assertion failed');
}

console.log('\n=== Agent Scheduler — duplicate prevention ===\n');

const now = new Date('2026-07-11T03:00:00.000Z');

assert(
  shouldEnqueueSourceScan({
    sourceStatus: 'active',
    nextScanAt: new Date('2026-07-11T02:00:00.000Z'),
    now,
    hasActiveScanJob: false,
  }),
  'enqueues when due and no active job',
);

assert(
  !shouldEnqueueSourceScan({
    sourceStatus: 'active',
    nextScanAt: new Date('2026-07-11T02:00:00.000Z'),
    now,
    hasActiveScanJob: true,
  }),
  'blocks when queued/running scan_source exists',
);

assert(
  !shouldEnqueueSourceScan({
    sourceStatus: 'paused',
    nextScanAt: new Date('2026-07-11T02:00:00.000Z'),
    now,
    hasActiveScanJob: false,
  }),
  'blocks paused source',
);

assert(
  !shouldEnqueueSourceScan({
    sourceStatus: 'active',
    nextScanAt: new Date('2026-07-11T04:00:00.000Z'),
    now,
    hasActiveScanJob: false,
  }),
  'blocks when nextScanAt is in the future',
);

assert(
  shouldEnqueueSourceScan({
    sourceStatus: 'active',
    nextScanAt: null,
    now,
    hasActiveScanJob: false,
  }),
  'enqueues when nextScanAt is null (first schedule)',
);

const next = computeNextScanAt(now, 60);
assert(
  next.toISOString() === '2026-07-11T04:00:00.000Z',
  'nextScanAt = now + scanIntervalMinutes',
);

assert(
  computeNextScanAt(now, 0).getTime() === now.getTime() + 60 * 60_000,
  'invalid interval falls back to 60 minutes',
);
assert(
  computeNextScanAt(now, 1).getTime() === now.getTime() + 60_000,
  '1 minute interval accepted',
);

// Simulate double-tick: first creates job (hasActive=true), second must skip
const afterFirstTick = shouldEnqueueSourceScan({
  sourceStatus: 'active',
  nextScanAt: now,
  now,
  hasActiveScanJob: true,
});
assert(!afterFirstTick, 'second tick with same due source skips duplicate');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
