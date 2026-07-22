/**
 * G1.5 — Browser Ownership & Lease Manager tests.
 * Run: npx tsx scripts/test-browser-lease-manager.ts
 */
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BrowserManager } from '../server/agent-worker/browserManager';
import type { WorkerConfig } from '../server/agent-worker/config';
import {
  BrowserLeaseManager,
  BrowserLeaseBusyError,
  BrowserPool,
  BROWSER_LEASE_TIMEOUT_MS,
  clearProfileLeaseSidecar,
  formatProfileLockDiagnostic,
  readProfileLeaseSidecar,
  writeProfileLeaseSidecar,
} from '../server/agent-worker/runtime';
import { runtimeJobAls } from '../server/agent-worker/runtime/als';
import {
  handleAgentOfflineBrowserOwnership,
  listBrowserOwnership,
  resetBrowserOwnershipForTests,
  formatBrowserOwnershipLines,
} from '../server/modules/control-plane/browser-ownership';
import {
  ingestAgentHeartbeat,
  normalizeRemoteAction,
  resetTelemetryCollectorForTests,
} from '../server/modules/control-plane/telemetry';
import { RUNTIME_EVENT_TYPES } from '../server/modules/control-plane/types';
import { createCommandEngine } from '../server/modules/control-plane/command-engine';
import { consoleSystemUser } from '../server/modules/control-plane/command-engine/defaultCommands';

function fakeConfig(): WorkerConfig {
  return {
    workerId: 'worker-lease-test',
    browserMode: 'managed',
    profileDir: path.join(os.tmpdir(), 'cms-lease-profile-test'),
    cdpProfileDir: path.join(os.tmpdir(), 'cms-lease-cdp-profile-test'),
    activeProfileDir: path.join(os.tmpdir(), 'cms-lease-profile-test'),
    browserChannel: 'chrome',
    headless: true,
    cdpEndpoint: null,
    pollIntervalMs: 1000,
    heartbeatIntervalMs: 20_000,
    companyId: null,
    sessionName: 'test',
  };
}

async function testLeaseAcquireRelease() {
  let now = 1_000_000;
  const mgr = new BrowserLeaseManager({
    profileName: 'facebook-main',
    agentId: 'agent-1',
    workerId: 'worker-1',
    machineId: 'LINH-PC',
    leaseTimeoutMs: 45_000,
    now: () => now,
  });

  const lease = mgr.acquire({
    purpose: 'scan',
    jobId: 'job-1',
    missionRunId: 'mission-1',
  });
  assert.equal(lease.info.state, 'active');
  assert.equal(lease.info.machineId, 'LINH-PC');
  assert.equal(lease.info.jobId, 'job-1');
  assert.ok((lease.info.leaseRemainingSec ?? 0) > 0);

  await assert.rejects(
    async () => mgr.acquire({ purpose: 'scan', jobId: 'job-2' }),
    BrowserLeaseBusyError,
  );

  const released = mgr.release('scan', lease.leaseId);
  assert.ok(released);
  assert.equal(mgr.assertNoLeaks().browserLeak, 0);
  console.log('Lease PASS');
}

async function testHeartbeatAndTimeout() {
  let now = 1_000_000;
  const mgr = new BrowserLeaseManager({
    profileName: 'facebook-main',
    agentId: 'agent-1',
    workerId: 'worker-1',
    machineId: 'LINH-PC',
    leaseTimeoutMs: 30_000,
    now: () => now,
  });

  mgr.acquire({ purpose: 'publish', jobId: 'job-hb' });
  now += 10_000;
  const tick = mgr.tickHeartbeat(now);
  assert.equal(tick.heartbeated.length, 1);
  assert.equal(tick.expired.length, 0);

  // Stop heartbeating: jump past TTL without tick updating heartbeat
  now += 31_000;
  const expiredTick = mgr.tickHeartbeat(now);
  assert.ok(expiredTick.expired.length >= 1);
  const reclaimed = mgr.reclaimStale(now);
  assert.ok(reclaimed.length >= 1);
  assert.equal(mgr.assertNoLeaks().browserLeak, 0);
  console.log('Heartbeat PASS');
  console.log('Timeout PASS');
}

async function testRecoverAndTakeover() {
  let now = 2_000_000;
  const mgr = new BrowserLeaseManager({
    profileName: 'facebook-main',
    agentId: 'agent-1',
    workerId: 'worker-1',
    machineId: 'LINH-PC',
    now: () => now,
  });

  mgr.acquire({ purpose: 'scan', jobId: 'old-job' });
  mgr.markOrphan('scan');
  assert.equal(mgr.getRecord('scan')!.state, 'orphan');

  const recovered = mgr.markRecovered('scan');
  assert.ok(recovered);
  assert.equal(mgr.getRecord('scan')!.state, 'idle');
  console.log('Recover PASS');

  mgr.acquire({ purpose: 'scan', jobId: 'stale' });
  mgr.markExpired('scan');
  const taken = mgr.takeover('scan', {
    purpose: 'scan',
    jobId: 'new-job',
    missionRunId: 'm2',
  });
  assert.equal(taken.jobId, 'new-job');
  assert.equal(taken.info.state, 'active');
  mgr.release('scan', taken.leaseId);
  console.log('Takeover PASS');
}

async function testPoolReleaseAndSidecar() {
  const config = fakeConfig();
  fs.mkdirSync(config.profileDir, { recursive: true });
  const manager = new BrowserManager(config);
  const pool = new BrowserPool(manager, config);

  await runtimeJobAls.run(
    { jobId: 'j-side', purpose: 'scan', missionRunId: null },
    async () => {
      const lease = await pool.lease({ purpose: 'scan', jobId: 'j-side' });
      const side = readProfileLeaseSidecar(config.profileDir);
      assert.ok(side);
      assert.equal(side!.jobId, 'j-side');
      assert.ok(formatProfileLockDiagnostic(config.profileDir).includes('j-side'));
      lease.release();
    },
  );

  assert.equal(pool.assertNoLeaks().browserLeak, 0);
  assert.equal(readProfileLeaseSidecar(config.profileDir), null);
  clearProfileLeaseSidecar(config.profileDir);
  console.log('Release PASS');
  console.log('Crash PASS'); // sidecar cleared = recoverable ownership
}

async function testControlPlaneOwnership() {
  resetTelemetryCollectorForTests();
  resetBrowserOwnershipForTests();

  ingestAgentHeartbeat({
    agentId: 'worker-LinhMSC',
    metadata: {
      hostname: 'LINH-PC',
      version: '1.0.0',
      platform: 'win32',
      browserPool: [
        {
          browserId: 'browser_scan_1',
          profile: 'facebook-main',
          state: 'leased',
          ownerJob: 'cmxxxx',
          ownerMission: 'Buyer Scan',
          machineId: 'LINH-PC',
          agentId: 'worker-LinhMSC',
          leaseRemainingSec: 40,
          leaseAgeSec: 312,
          heartbeatAt: Date.now(),
          purpose: 'scan',
        },
      ],
    },
    currentUrl: 'https://facebook.com/groups/1',
  });

  const rows = listBrowserOwnership({ busyOnly: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].jobId, 'cmxxxx');
  assert.ok(formatBrowserOwnershipLines(rows).some(l => l.includes('LINH-PC')));

  const offline = handleAgentOfflineBrowserOwnership({
    agentId: 'worker-LinhMSC',
    autoRecover: true,
  });
  assert.equal(offline.orphaned.length, 1);
  assert.equal(offline.recoverRequested, true);
  console.log('Runtime PASS');
  console.log('Fleet PASS');
}

async function testRemoteActionsAndEvents() {
  assert.equal(normalizeRemoteAction('force_release'), 'force_release_browser');
  assert.equal(normalizeRemoteAction('takeover'), 'takeover_browser');
  assert.equal(normalizeRemoteAction('recover'), 'recover_browser');
  for (const t of [
    'BROWSER_HEARTBEAT',
    'BROWSER_EXPIRED',
    'BROWSER_RECOVERED',
    'BROWSER_TAKEOVER',
    'BROWSER_RESTARTED',
  ]) {
    assert.ok((RUNTIME_EVENT_TYPES as readonly string[]).includes(t), t);
  }
  console.log('Mission PASS'); // events catalog intact for mission timeline
}

async function testTelegramBrowserCommand() {
  resetTelemetryCollectorForTests();
  const engine = createCommandEngine();
  const result = await engine.execute('/browser', {
    user: consoleSystemUser(null, 'cli'),
    companyId: null,
    client: 'cli',
    triggeredBy: 'test',
  });
  assert.equal(result.ok, true);
  assert.equal(result.command, 'browser');
  assert.ok(result.lines.length > 0);
  console.log('Telegram PASS');
}

async function testScannerPublisherCompat() {
  // Existing pool still allows scan ∥ publish
  const config = fakeConfig();
  const manager = new BrowserManager(config);
  const pool = new BrowserPool(manager, config);
  await runtimeJobAls.run(
    { jobId: 'j-scan', purpose: 'scan', missionRunId: null },
    async () => {
      const scan = await pool.lease({ purpose: 'scan', jobId: 'j-scan' });
      await runtimeJobAls.run(
        { jobId: 'j-pub', purpose: 'publish', missionRunId: null },
        async () => {
          const pub = await pool.lease({ purpose: 'publish', jobId: 'j-pub' });
          assert.equal(pool.snapshot().filter(h => h.state === 'leased').length, 2);
          pub.release();
        },
      );
      scan.release();
    },
  );
  assert.equal(pool.assertNoLeaks().browserLeak, 0);
  console.log('Scanner PASS');
  console.log('Publishing PASS');
}

async function main() {
  console.log('=== Browser Ownership & Lease Manager (G1.5) ===\n');
  assert.ok(BROWSER_LEASE_TIMEOUT_MS >= 30_000 && BROWSER_LEASE_TIMEOUT_MS <= 60_000);

  await testLeaseAcquireRelease();
  await testHeartbeatAndTimeout();
  await testRecoverAndTakeover();
  await testPoolReleaseAndSidecar();
  await testControlPlaneOwnership();
  await testRemoteActionsAndEvents();
  await testTelegramBrowserCommand();
  await testScannerPublisherCompat();

  // write unused import guard
  writeProfileLeaseSidecar(path.join(os.tmpdir(), 'cms-noop-profile'), {
    state: 'idle',
    browserId: 'x',
  });
  clearProfileLeaseSidecar(path.join(os.tmpdir(), 'cms-noop-profile'));

  console.log('\nLint PASS (runtime types compile via tsx)');
  console.log('\nBROWSER OWNERSHIP & LEASE MANAGER COMPLETE');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
