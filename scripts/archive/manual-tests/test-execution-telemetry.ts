/**
 * Execution Agent Telemetry — Control Plane Runtime Snapshot + remote OPS.
 * Run: npx tsx scripts/test-execution-telemetry.ts
 */
import assert from 'node:assert/strict';
import {
  TELEMETRY_SCHEMA_VERSION,
  ingestAgentHeartbeat,
  getLastAgentSnapshot,
  listAgentSnapshots,
  enqueueRemoteCommand,
  drainRemoteCommands,
  peekRemoteCommands,
  resetTelemetryCollectorForTests,
  normalizeRuntimeSnapshot,
  normalizeRemoteAction,
  formatAgentTelemetryLines,
  formatBrowserTelemetryLines,
} from '../server/modules/control-plane/telemetry';
import { buildExecutionTelemetryMetadata } from '../server/automation-agent/telemetryCollector';
import {
  mapRuntimeEventToSmartKind,
  SMART_NOTIFICATION_KINDS,
} from '../server/modules/control-plane/telegram/smartNotifications';
import { createCommandEngine } from '../server/modules/control-plane/command-engine';
import { consoleSystemUser } from '../server/modules/control-plane/command-engine/defaultCommands';
import { RUNTIME_EVENT_TYPES } from '../server/modules/control-plane/types';

function sampleMetadata(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.2.3',
    hostname: 'local-dev',
    platform: 'win32/x64',
    host: {
      platform: 'win32/x64',
      arch: 'x64',
      hostname: 'local-dev',
      uptimeSec: 3600,
      loadAvg1m: 0.5,
      memTotalMb: 16384,
      memFreeMb: 8192,
      diskFreeMb: 50000,
      diskTotalMb: 500000,
    },
    process: {
      pid: 4242,
      rssMb: 220,
      heapUsedMb: 80,
      heapTotalMb: 120,
      uptimeSec: 900,
    },
    resources: {
      chromeCount: 2,
      currentSource: 'fb-group-hx',
      currentGroup: 'Hoa Xuan Buyers',
      postsScanned: 40,
      postsRemaining: 10,
      findings: 3,
      currentKeyword: 'bán đất',
      facebookAccount: 'fb.ops@example.com',
      currentAction: 'scroll',
    },
    browserPool: [
      {
        browserId: 'b1',
        profile: 'fb-main',
        state: 'leased',
        ownerJob: 'job-1',
        currentUrl: 'https://facebook.com/groups/1',
        leasedAt: new Date(Date.now() - 30_000).toISOString(),
      },
    ],
    executionPool: [{ slotId: 's1', runningJobs: 1, queuedWaiters: 2, owners: ['job-1'] }],
    jobs: {
      running: 1,
      waiting: 2,
      completed: 10,
      failed: 1,
      retry: 1,
      currentStep: 'scan_posts',
      progress: 0.4,
      etaSec: 120,
    },
    mission: {
      missionName: 'Scan Hoa Xuan',
      missionType: 'scan',
      currentStep: 'extract',
      progress: 0.4,
      durationSec: 45,
      findingCount: 3,
    },
    publish: {
      draftId: 'draft-1',
      destination: 'facebook_group',
      phase: 'uploading',
      evidence: true,
      publishedUrl: null,
      retryCount: 0,
    },
    scanner: {
      currentSource: 'fb-group-hx',
      currentGroup: 'Hoa Xuan Buyers',
      postsScanned: 40,
      postsRemaining: 10,
      findings: 3,
      currentKeyword: 'bán đất',
    },
    ...overrides,
  };
}

async function main() {
  console.log('=== Execution Telemetry Tests ===\n');
  resetTelemetryCollectorForTests();

  // --- Heartbeat ---
  const snap1 = ingestAgentHeartbeat({
    agentId: 'agent-local-1',
    metadata: sampleMetadata(),
    currentUrl: 'https://facebook.com/groups/1',
    status: 'ready',
    heartbeatAt: '2026-07-19T07:00:00.000Z',
  });
  assert.equal(snap1.schemaVersion, TELEMETRY_SCHEMA_VERSION);
  assert.equal(snap1.agentId, 'agent-local-1');
  assert.equal(snap1.hostname, 'local-dev');
  assert.equal(snap1.version, '1.2.3');
  assert.equal(snap1.platform, 'win32/x64');
  assert.equal(snap1.uptimeSec, 900);
  assert.equal(snap1.heartbeatAt, '2026-07-19T07:00:00.000Z');
  console.log('Heartbeat PASS');

  // --- Telemetry snapshot (no duplicate store) ---
  const again = ingestAgentHeartbeat({
    agentId: 'agent-local-1',
    metadata: sampleMetadata({ version: '1.2.4' }),
    status: 'ready',
  });
  assert.equal(listAgentSnapshots().length, 1);
  assert.equal(getLastAgentSnapshot('agent-local-1')?.version, '1.2.4');
  assert.equal(again.chromeCount, 2);
  assert.equal(again.process.rssMb, 220);
  assert.ok(again.host.memTotalMb && again.host.memTotalMb > 0);
  console.log('Telemetry PASS');

  // --- Browser ---
  assert.equal(again.browserProfiles.length, 1);
  assert.equal(again.browserProfiles[0].profile, 'fb-main');
  assert.equal(again.browserProfiles[0].busy, true);
  assert.equal(again.browserProfiles[0].lockedBy, 'job-1');
  assert.equal(again.browserProfiles[0].facebookAccount, 'fb.ops@example.com');
  const browserLines = formatBrowserTelemetryLines(again);
  assert.ok(browserLines.some(l => l.includes('fb-main')));
  console.log('Browser PASS');

  // --- Scanner ---
  assert.equal(again.scanner?.currentSource, 'fb-group-hx');
  assert.equal(again.scanner?.postsScanned, 40);
  assert.equal(again.scanner?.findings, 3);
  assert.equal(again.scanner?.currentKeyword, 'bán đất');
  console.log('Scanner PASS');

  // --- Publish ---
  assert.equal(again.publish?.destination, 'facebook_group');
  assert.equal(again.publish?.phase, 'uploading');
  assert.equal(again.publish?.evidence, true);
  assert.equal(again.publish?.retryCount, 0);
  console.log('Publish PASS');

  // --- Mission ---
  assert.equal(again.mission?.missionName, 'Scan Hoa Xuan');
  assert.equal(again.mission?.currentStep, 'extract');
  assert.equal(again.mission?.findingCount, 3);
  const agentLines = formatAgentTelemetryLines(again);
  assert.ok(agentLines.some(l => l.includes('Scan Hoa Xuan')));
  console.log('Mission PASS');

  // --- Jobs ---
  assert.equal(again.jobs.running, 1);
  assert.equal(again.jobs.waiting, 2);
  assert.equal(again.jobs.currentStep, 'scan_posts');
  assert.equal(again.jobs.etaSec, 120);

  // --- Normalize pure ---
  const pure = normalizeRuntimeSnapshot({
    agentId: 'a2',
    metadata: sampleMetadata({ version: '9.9.9' }),
  });
  assert.equal(pure.version, '9.9.9');

  // --- Agent-side builder ---
  const built = buildExecutionTelemetryMetadata({
    agentId: 'agent-x',
    version: '0.1.0',
    hostname: 'host-x',
    browserPool: [{ browserId: 'b', profile: 'p', state: 'idle' }],
    executionPool: [{ runningJobs: 0, queuedWaiters: 1 }],
    process: { pid: 1, rssMb: 10, heapUsedMb: 5, heapTotalMb: 8, uptimeSec: 10 },
    resources: { chromeCount: 1 },
  });
  assert.equal(built.schemaVersion, TELEMETRY_SCHEMA_VERSION);
  assert.ok((built.host as { hostname: string }).hostname === 'host-x');
  console.log('Jobs builder PASS');

  // --- Recovery / Remote OPS (no SSH) ---
  resetTelemetryCollectorForTests();
  ingestAgentHeartbeat({ agentId: 'agent-ops', metadata: sampleMetadata() });
  const cmd = enqueueRemoteCommand({
    agentId: 'agent-ops',
    action: 'release_browser',
  });
  assert.ok(cmd.id.startsWith('ops_'));
  assert.equal(peekRemoteCommands('agent-ops').length, 1);
  const drained = drainRemoteCommands('agent-ops');
  assert.equal(drained.length, 1);
  assert.equal(drained[0].action, 'release_browser');
  assert.equal(drainRemoteCommands('agent-ops').length, 0);

  assert.equal(normalizeRemoteAction('release'), 'release_browser');
  assert.equal(normalizeRemoteAction('restart'), 'restart_agent');
  assert.equal(normalizeRemoteAction('refresh'), 'refresh_runtime');
  assert.equal(normalizeRemoteAction('pause'), 'pause_job');
  assert.equal(normalizeRemoteAction('bogus'), null);
  console.log('Recovery PASS');

  // --- Runtime events catalog ---
  for (const t of [
    'AGENT_RESTART',
    'BROWSER_CRASH',
    'QUEUE_BLOCKED',
    'PUBLISH_STARTED',
    'PUBLISH_FINISHED',
  ] as const) {
    assert.ok(RUNTIME_EVENT_TYPES.includes(t), t);
  }
  assert.equal(
    mapRuntimeEventToSmartKind({ type: 'BROWSER_CRASH', payload: {} }),
    'BROWSER_CRASH',
  );
  assert.equal(
    mapRuntimeEventToSmartKind({ type: 'QUEUE_BLOCKED', payload: {} }),
    'QUEUE_BLOCKED',
  );
  assert.equal(
    mapRuntimeEventToSmartKind({ type: 'PUBLISH_FINISHED', payload: {} }),
    'PUBLISH_SUCCESS',
  );
  assert.ok(SMART_NOTIFICATION_KINDS.includes('BROWSER_CRASH'));
  console.log('Runtime PASS');

  // --- Telegram commands registered ---
  const engine = createCommandEngine();
  const names = engine.registry.list().map(c => c.name);
  for (const n of [
    'agent',
    'browser',
    'jobs',
    'scan',
    'publish',
    'runtime',
    'health',
  ]) {
    assert.ok(names.includes(n), `missing command /${n}`);
  }

  ingestAgentHeartbeat({
    agentId: 'agent-local-1',
    metadata: sampleMetadata(),
    status: 'ready',
  });
  const user = consoleSystemUser(null, 'telegram');
  const browserProfiles = await engine.execute('/browser profiles', {
    user,
    companyId: null,
    triggeredBy: 'test',
    client: 'telegram',
  });
  assert.equal(browserProfiles.ok, true);
  assert.ok(browserProfiles.lines.some(l => /profiles/i.test(l)));
  assert.ok(browserProfiles.lines.some(l => /fb-main|agent-local-1/i.test(l)));
  console.log('Telegram PASS');

  console.log('\nAll execution telemetry checks PASS');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
