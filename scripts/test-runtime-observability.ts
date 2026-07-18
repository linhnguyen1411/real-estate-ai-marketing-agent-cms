/**
 * Runtime Observability unit tests (no FB / no mutations).
 * Run: npx tsx scripts/test-runtime-observability.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserManager } from '../server/agent-worker/browserManager';
import type { WorkerConfig } from '../server/agent-worker/config';
import { BrowserPool, ExecutionPool } from '../server/agent-worker/runtime';
import { runtimeJobAls } from '../server/agent-worker/runtime/als';

function fakeConfig(): WorkerConfig {
  return {
    workerId: 'test-obs-worker',
    browserMode: 'managed',
    profileDir: 'F:/tmp/agent-profile-test',
    browserChannel: 'chrome',
    headless: true,
    cdpEndpoint: null,
    pollIntervalMs: 1000,
    heartbeatIntervalMs: 20_000,
    companyId: null,
    sessionName: 'test-obs',
  };
}

async function testExecutionPoolObservabilityFields() {
  const pool = new ExecutionPool({
    scan: { maxConcurrency: 1 },
    publish: { maxConcurrency: 1 },
    messaging: { maxConcurrency: 0 },
    comment: { maxConcurrency: 0 },
  });

  const lease = await pool.acquire('scan', { jobId: 'j-obs-1', missionRunId: 'm-1' });
  const snapBusy = pool.snapshot().find(s => s.kind === 'scan')!;
  assert.equal(snapBusy.runningJobs, 1);
  assert.equal(snapBusy.busyPercent, 100);
  assert.ok('queuedWaiters' in snapBusy);
  assert.ok('failedSinceBoot' in snapBusy);
  assert.ok('avgRuntimeMsSinceBoot' in snapBusy);

  lease.release();
  pool.recordOutcome('scan', 'completed', 1200);
  pool.recordOutcome('scan', 'failed', 400);
  const snap = pool.snapshot().find(s => s.kind === 'scan')!;
  assert.equal(snap.runningJobs, 0);
  assert.equal(snap.busyPercent, 0);
  assert.equal(snap.completedSinceBoot, 1);
  assert.equal(snap.failedSinceBoot, 1);
  assert.equal(snap.avgRuntimeMsSinceBoot, 800);
  console.log('✓ execution pool observability fields');
}

async function testBrowserPoolObservabilityFields() {
  const mgr = new BrowserManager(fakeConfig());
  const pool = new BrowserPool(mgr, fakeConfig());
  const before = pool.snapshot();
  assert.equal(before.length, 4);
  for (const b of before) {
    assert.ok(b.browserId);
    assert.ok(b.purpose);
    assert.equal(b.state, 'idle');
    assert.equal(b.leaseAgeSec, null);
    assert.ok('heartbeatAt' in b);
  }

  await runtimeJobAls.run(
    { jobId: 'j-pub-1', purpose: 'publish', missionRunId: 'm-pub' },
    async () => {
      const lease = await pool.lease({
        purpose: 'publish',
        jobId: 'j-pub-1',
        missionRunId: 'm-pub',
      });
      const leased = pool.snapshot().find(b => b.purpose === 'publish')!;
      assert.equal(leased.state, 'leased');
      assert.equal(leased.ownerJob, 'j-pub-1');
      assert.equal(leased.ownerMission, 'm-pub');
      assert.ok(typeof leased.leaseAgeSec === 'number');
      lease.release();
    },
  );

  const after = pool.snapshot().find(b => b.purpose === 'publish')!;
  assert.equal(after.state, 'idle');
  assert.equal(after.ownerJob, null);
  console.log('✓ browser pool observability fields');
}

async function testUiAndApiWiring() {
  const root = path.resolve(process.cwd());
  const page = path.join(
    root,
    'src/features/agent/runtime-monitor/pages/RuntimeMonitorPage.tsx',
  );
  const api = path.join(root, 'src/services/agentPlatformApi.ts');
  const routes = path.join(root, 'server/agent/agentRoutes.ts');
  const agg = path.join(root, 'server/agent/runtimeObservability.ts');
  const types = path.join(root, 'src/types/agentPlatform.ts');

  for (const f of [page, api, routes, agg, types]) {
    assert.ok(fs.existsSync(f), `missing ${f}`);
  }

  const pageSrc = fs.readFileSync(page, 'utf8');
  assert.match(pageSrc, /fetchAutomationRuntime/);
  assert.match(pageSrc, /Execution Pool/);
  assert.match(pageSrc, /Browser Pool/);
  assert.match(pageSrc, /Mission Runtime/);
  assert.match(pageSrc, /Campaign Runtime/);
  assert.match(pageSrc, /Health Score/);

  const apiSrc = fs.readFileSync(api, 'utf8');
  assert.match(apiSrc, /\/api\/agent\/runtime/);

  const routesSrc = fs.readFileSync(routes, 'utf8');
  assert.match(routesSrc, /\/api\/agent\/runtime/);
  assert.match(routesSrc, /ControlPlane/);

  const typesSrc = fs.readFileSync(types, 'utf8');
  assert.match(typesSrc, /export interface AutomationRuntimeSnapshot/);

  const { buildAutomationRuntimeSnapshot } = await import(
    '../server/agent/runtimeObservability'
  );
  assert.equal(typeof buildAutomationRuntimeSnapshot, 'function');
  console.log('✓ UI + API wiring');
}

async function testSnapshotShapeAgainstDb() {
  const { checkDatabaseConnection } = await import('../server/prisma');
  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.log('⚠ skip live snapshot (DB unavailable)');
    return;
  }

  const { buildAutomationRuntimeSnapshot } = await import(
    '../server/agent/runtimeObservability'
  );
  const snap = await buildAutomationRuntimeSnapshot({
    id: 'test',
    name: 'test',
    email: 'test@local',
    role: 'owner',
    company_id: undefined,
  });

  for (const key of [
    'generatedAt',
    'healthScore',
    'health',
    'workers',
    'slots',
    'browsers',
    'queue',
    'activeJobs',
    'missions',
    'missionTimeline',
    'campaigns',
    'metrics',
  ]) {
    assert.ok(key in snap, `missing ${key}`);
  }
  assert.ok(typeof snap.healthScore === 'number');
  assert.ok('worker' in snap.health);
  assert.ok('waiting' in snap.queue);
  assert.ok('deadLetter' in snap.queue);
  assert.ok('publishPerHour' in snap.metrics);
  assert.ok('slotUtilization' in snap.metrics);
  console.log('✓ live snapshot shape');
}

async function main() {
  await testExecutionPoolObservabilityFields();
  await testBrowserPoolObservabilityFields();
  await testUiAndApiWiring();
  await testSnapshotShapeAgainstDb();
  console.log('\nRuntime observability PASS');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
