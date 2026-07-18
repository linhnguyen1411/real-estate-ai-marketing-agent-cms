/**
 * Execution Pool + Browser Pool unit tests (no FB / no DB).
 * Run: npx tsx scripts/test-execution-pool.ts
 */
import assert from 'node:assert/strict';
import { BrowserManager } from '../server/agent-worker/browserManager';
import type { WorkerConfig } from '../server/agent-worker/config';
import {
  BrowserPool,
  ExecutionPool,
  SlotBusyError,
  SlotStoppedError,
  slotKindForJobType,
} from '../server/agent-worker/runtime';
import { runtimeJobAls } from '../server/agent-worker/runtime/als';

function fakeConfig(): WorkerConfig {
  return {
    workerId: 'test-worker',
    browserMode: 'managed',
    profileDir: 'F:/tmp/agent-profile-test',
    browserChannel: 'chrome',
    headless: true,
    cdpEndpoint: null,
    pollIntervalMs: 1000,
    heartbeatIntervalMs: 20_000,
    companyId: null,
    sessionName: 'test',
  };
}

async function testSlotMap() {
  assert.equal(slotKindForJobType('scan_source'), 'scan');
  assert.equal(slotKindForJobType('publish_social'), 'publish');
  assert.equal(slotKindForJobType('health_check'), null);
  console.log('✓ slot map');
}

async function testScanPublishConcurrent() {
  const pool = new ExecutionPool({
    scan: { maxConcurrency: 1 },
    publish: { maxConcurrency: 1 },
    messaging: { maxConcurrency: 0 },
    comment: { maxConcurrency: 0 },
  });

  const scan = await pool.acquire('scan', { jobId: 'j-scan' });
  const pub = await pool.acquire('publish', { jobId: 'j-pub' });
  assert.equal(pool.snapshot().find(s => s.kind === 'scan')!.runningJobs, 1);
  assert.equal(pool.snapshot().find(s => s.kind === 'publish')!.runningJobs, 1);

  await assert.rejects(() => pool.acquire('scan', { jobId: 'j-scan-2', waitTimeoutMs: 0 }), SlotBusyError);

  scan.release();
  pub.release();
  assert.equal(pool.assertNoLeaks().slotLeak, 0);
  console.log('✓ scan + publish concurrent slots');
}

async function testStopPublishKeepsScan() {
  const pool = new ExecutionPool({
    scan: { maxConcurrency: 1 },
    publish: { maxConcurrency: 1 },
    messaging: { maxConcurrency: 0 },
    comment: { maxConcurrency: 0 },
  });

  const scan = await pool.acquire('scan', { jobId: 'j-scan' });
  pool.stopSlot('publish');

  await assert.rejects(() => pool.acquire('publish', { jobId: 'j-pub' }), SlotStoppedError);

  // Scan still runs / can release and re-acquire
  scan.release();
  const scan2 = await pool.acquire('scan', { jobId: 'j-scan-2' });
  scan2.release();
  assert.equal(pool.assertNoLeaks().slotLeak, 0);
  console.log('✓ stop publish does not stop scan');
}

async function testBrowserLeaseNoLeak() {
  const config = fakeConfig();
  const manager = new BrowserManager(config);
  const browsers = new BrowserPool(manager, config);

  await runtimeJobAls.run(
    { jobId: 'j1', purpose: 'scan', missionRunId: null },
    async () => {
      const lease = await browsers.lease({ purpose: 'scan', jobId: 'j1' });
      assert.equal(browsers.snapshot().find(h => h.purpose === 'scan')!.state, 'leased');
      // Same job reentrant CDP
      await manager.beginCdpJob('scan');
      manager.releaseCdpLock('scan');
      lease.release();
    },
  );

  assert.equal(browsers.assertNoLeaks().browserLeak, 0);
  assert.equal(manager.isCdpBusy(), false);
  console.log('✓ browser lease leak = 0');
}

async function testRecoveryRelease() {
  const pool = new ExecutionPool({
    scan: { maxConcurrency: 1 },
    publish: { maxConcurrency: 1 },
    messaging: { maxConcurrency: 0 },
    comment: { maxConcurrency: 0 },
  });
  const config = fakeConfig();
  const manager = new BrowserManager(config);
  const browsers = new BrowserPool(manager, config);

  await runtimeJobAls.run(
    { jobId: 'j-crash', purpose: 'publish', missionRunId: 'mr-1' },
    async () => {
      await pool.acquire('publish', { jobId: 'j-crash', missionRunId: 'mr-1' });
      await browsers.lease({ purpose: 'publish', jobId: 'j-crash', missionRunId: 'mr-1' });
    },
  );

  // Simulate crash recovery without calling lease.release()
  browsers.releaseMission('mr-1');
  pool.releaseMission('mr-1');

  assert.equal(browsers.assertNoLeaks().browserLeak, 0);
  assert.equal(pool.assertNoLeaks().slotLeak, 0);
  console.log('✓ recovery releases browser + slot');
}

async function testStopJob() {
  const pool = new ExecutionPool({
    scan: { maxConcurrency: 1 },
    publish: { maxConcurrency: 1 },
    messaging: { maxConcurrency: 0 },
    comment: { maxConcurrency: 0 },
  });
  await pool.acquire('scan', { jobId: 'j-stop' });
  assert.equal(pool.stopJob('j-stop'), true);
  assert.equal(pool.assertNoLeaks().slotLeak, 0);
  console.log('✓ stop job releases slot');
}

async function main() {
  console.log('Execution Pool tests');
  await testSlotMap();
  await testScanPublishConcurrent();
  await testStopPublishKeepsScan();
  await testBrowserLeaseNoLeak();
  await testRecoveryRelease();
  await testStopJob();
  console.log('\nEXECUTION POOL TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
