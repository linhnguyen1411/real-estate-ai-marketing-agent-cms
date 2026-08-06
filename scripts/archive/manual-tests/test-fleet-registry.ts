/**
 * Fleet Registry & Awareness tests.
 * Run: npx tsx scripts/test-fleet-registry.ts
 */
import assert from 'node:assert/strict';
import type { BrowserSession } from '@prisma/client';
import {
  aggregateFleetState,
  enrichFleetAgent,
  fleetAgentFromSession,
  listFleetBrowsers,
  formatFleetDashboardLines,
  formatFleetAgentDetailLines,
  formatFleetBrowserLines,
} from '../server/modules/control-plane/fleet';
import {
  resetTelemetryCollectorForTests,
  ingestAgentHeartbeat,
} from '../server/modules/control-plane/telemetry';
import { createCommandEngine } from '../server/modules/control-plane/command-engine';
import { sessionToAgentNode } from '../server/modules/control-plane/agentRegistry';
import { consoleSystemUser } from '../server/modules/control-plane/command-engine/defaultCommands';

function baseMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    agentId: 'agent-fleet-1',
    hostname: 'LinhMSC',
    machineId: 'machine-linhmsc',
    displayName: 'Local PC',
    tags: ['local', 'scan'],
    version: '2.0.0',
    platform: 'win32/x64',
    host: {
      platform: 'win32/x64',
      arch: 'x64',
      hostname: 'LinhMSC',
      uptimeSec: 1000,
      loadAvg1m: 0.3,
      memTotalMb: 16000,
      memFreeMb: 8000,
    },
    process: { pid: 1, rssMb: 200, heapUsedMb: 80, heapTotalMb: 100, uptimeSec: 500 },
    capabilities: ['scan', 'publish', 'browser'],
    browserPool: [
      {
        browserId: 'b1',
        profile: 'fb-main',
        state: 'leased',
        ownerJob: 'job-9',
        currentUrl: 'https://facebook.com/groups/1',
        leasedAt: new Date(Date.now() - 10_000).toISOString(),
      },
    ],
    executionPool: [{ runningJobs: 1, queuedWaiters: 0, owners: ['job-9'] }],
    jobs: { running: 1, waiting: 0, currentStep: 'scan_posts', owners: ['job-9'] },
    mission: { missionName: 'Scan HN', missionType: 'scan', currentStep: 'collect', findingCount: 2 },
    scanner: {
      currentSource: 'src-1',
      currentGroup: 'Group A',
      postsScanned: 5,
      findings: 2,
      currentKeyword: 'ban',
    },
    publish: { phase: 'idle' },
    ...extra,
  };
}

function fakeSession(partial: {
  id?: string;
  workerId?: string;
  status?: string;
  lastHeartbeatAt?: Date;
  metadata?: Record<string, unknown>;
}): BrowserSession {
  const now = new Date();
  return {
    id: partial.id || 'sess-1',
    companyId: null,
    name: 'Exec Local',
    status: partial.status || 'ready',
    workerId: partial.workerId || 'agent-fleet-1',
    profilePath: 'p1',
    currentUrl: 'https://facebook.com/groups/1',
    lastHeartbeatAt: partial.lastHeartbeatAt || now,
    lastError: null,
    metadata: partial.metadata || baseMeta(),
    createdAt: now,
    updatedAt: now,
  } as BrowserSession;
}

async function main() {
  console.log('=== Fleet Registry Tests ===\n');
  resetTelemetryCollectorForTests();

  const session = fakeSession({});
  const agent = fleetAgentFromSession(session);
  assert.equal(agent.agentId, 'agent-fleet-1');
  assert.equal(agent.displayName, 'Local PC');
  assert.equal(agent.hostname, 'LinhMSC');
  assert.equal(agent.machineId, 'machine-linhmsc');
  assert.equal(agent.platform, 'win32/x64');
  assert.equal(agent.version, '2.0.0');
  assert.deepEqual(agent.tags, ['local', 'scan']);
  assert.equal(agent.status, 'online');
  assert.equal(agent.activity, 'scanning');
  assert.ok(agent.uptimeSec != null);
  assert.equal(agent.jobs.running, 1);
  assert.equal(agent.mission?.missionName, 'Scan HN');
  assert.equal(agent.browserProfiles.length, 1);
  console.log('Fleet Registry PASS');

  ingestAgentHeartbeat({
    agentId: 'agent-fleet-1',
    metadata: baseMeta(),
    currentUrl: session.currentUrl,
    status: 'ready',
    heartbeatAt: new Date().toISOString(),
  });
  const node = sessionToAgentNode(session);
  const enriched = enrichFleetAgent(node, session);
  assert.equal(enriched.activity, 'scanning');
  assert.ok(enriched.snapshot);
  console.log('Runtime Snapshot PASS');

  const idle = fleetAgentFromSession(
    fakeSession({
      id: 'sess-2',
      workerId: 'agent-idle',
      metadata: baseMeta({
        agentId: 'agent-idle',
        hostname: 'MiniPC',
        machineId: 'mini-1',
        displayName: 'Mini',
        tags: ['idle'],
        version: '1.0.0',
        platform: 'linux/x64',
        host: { platform: 'linux/x64', hostname: 'MiniPC', uptimeSec: 10, memTotalMb: 8 },
        process: { pid: 2, rssMb: 50, heapUsedMb: 20, heapTotalMb: 40, uptimeSec: 10 },
        capabilities: ['browser'],
        browserPool: [{ browserId: 'b2', profile: 'p', state: 'idle' }],
        executionPool: [{ runningJobs: 0, queuedWaiters: 0 }],
        jobs: { running: 0, waiting: 0, owners: [] },
        mission: null,
        scanner: null,
        publish: { phase: 'idle' },
      }),
    }),
  );
  assert.equal(idle.activity, 'idle');

  const offline = fleetAgentFromSession(
    fakeSession({
      id: 'sess-3',
      workerId: 'agent-off',
      status: 'offline',
      lastHeartbeatAt: new Date(Date.now() - 120_000),
      metadata: baseMeta({
        agentId: 'agent-off',
        hostname: 'Old',
        machineId: 'old',
        browserPool: [],
        executionPool: [],
        jobs: { running: 0, waiting: 0, owners: [] },
        mission: null,
        scanner: null,
      }),
    }),
  );
  assert.equal(offline.activity, 'offline');

  const state = aggregateFleetState([agent, idle, offline]);
  assert.equal(state.total, 3);
  assert.ok(state.online >= 1);
  assert.ok(state.scanning >= 1);
  assert.ok(state.idle >= 1);
  assert.ok(state.offline >= 1);
  assert.ok(state.runningJobs >= 1);
  assert.ok(state.healthScore >= 0 && state.healthScore <= 100);
  const dash = formatFleetDashboardLines(state);
  assert.ok(dash.some(l => /Fleet/i.test(l)));
  assert.ok(dash.some(l => /LinhMSC/.test(l)));
  console.log('Fleet Dashboard PASS');

  const detail = formatFleetAgentDetailLines(agent);
  assert.ok(detail.some(l => /machine=machine-linhmsc/.test(l)));
  assert.ok(detail.some(l => /Scan HN/.test(l)));
  assert.ok(detail.some(l => /heartbeat=/.test(l)));
  console.log('Machine Detail PASS');

  const browsers = listFleetBrowsers([agent, idle]);
  assert.ok(browsers.length >= 1);
  assert.equal(browsers[0].hostname, 'LinhMSC');
  const browserLines = formatFleetBrowserLines(browsers);
  assert.ok(browserLines.some(l => /fb-main/.test(l)));
  console.log('Browser PASS');

  assert.equal(agent.mission?.missionType, 'scan');
  assert.equal(agent.scanner?.currentSource, 'src-1');
  console.log('Mission PASS');

  const engine = createCommandEngine();
  const names = engine.registry.list().map(c => c.name);
  assert.ok(names.includes('fleet'));
  assert.ok(names.includes('agent'));
  assert.ok(names.includes('browser'));
  assert.ok(names.includes('report'));
  const user = consoleSystemUser(null, 'telegram');
  const fleetCmd = await engine.execute('/fleet', {
    user,
    companyId: null,
    client: 'telegram',
    triggeredBy: 'test',
  });
  assert.equal(fleetCmd.ok, true);
  assert.ok(fleetCmd.lines.some(l => /Fleet/i.test(l)));
  console.log('Telegram PASS');

  console.log('\nAll fleet checks PASS');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
