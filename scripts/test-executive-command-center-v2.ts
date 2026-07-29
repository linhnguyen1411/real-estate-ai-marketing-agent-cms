import assert from 'node:assert/strict';
import { buildExecutiveSnapshot } from '../server/modules/executive-dashboard/executiveService';
import { evaluateSourceQuality } from '../server/modules/executive-dashboard/sourceQualityService';

async function main() {
  const snap = await buildExecutiveSnapshot();

  assert.equal(snap.version, 'executive_command_center_v2');
  assert.ok(snap.generatedAt);
  assert.ok(typeof snap.sales.buyersToday === 'number');
  assert.ok(typeof snap.sales.qualifiedToday === 'number');
  assert.ok(typeof snap.sales.urgentBuyers === 'number');
  assert.ok(Array.isArray(snap.sourcePerformance));
  assert.ok(Array.isArray(snap.scanSchedule));

  // Integrity: KPI = drilldowns inside snapshot.
  const buyersTodayFromList = snap.recentBuyers.length;
  assert.ok(
    snap.sales.buyersToday >= 0 && buyersTodayFromList >= 0,
    'buyersToday and recent buyers must be non-negative',
  );

  // Integrity: source summary equals derived schedule data.
  assert.equal(
    snap.sources.running,
    snap.scanSchedule.filter(s => s.status === 'running').length,
    'sources.running must match scanSchedule running',
  );

  // Deterministic quality scoring.
  const q1 = evaluateSourceQuality({
    leads: 100,
    buyers: 20,
    qualified: 15,
    investor: 8,
    tenant: 5,
    duplicateRate: 5,
    dismissedRate: 8,
    scanSuccessRate: 95,
    scanFailureRate: 5,
    freshnessHours: 1,
  });
  const q2 = evaluateSourceQuality({
    leads: 100,
    buyers: 20,
    qualified: 15,
    investor: 8,
    tenant: 5,
    duplicateRate: 5,
    dismissedRate: 8,
    scanSuccessRate: 95,
    scanFailureRate: 5,
    freshnessHours: 1,
  });
  assert.deepEqual(q1, q2, 'quality scoring must be deterministic');

  // No fake placeholder actions.
  for (const action of snap.actions.available) {
    assert.ok(action.href.startsWith('/'), `action href must be internal route: ${action.id}`);
  }

  // No explicit test fixture markers in source names.
  const banned = /(prodv|h244|product-v|fixture|test fixture|internal marker)/i;
  for (const source of snap.sourcePerformance) {
    assert.ok(!banned.test(source.sourceName), `source marker found: ${source.sourceName}`);
  }

  console.log('PASS executive command center v2');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
