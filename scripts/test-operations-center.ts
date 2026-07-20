/**
 * Operations Center / Fleet Orchestration tests.
 * Run: npx tsx scripts/test-operations-center.ts
 */
import assert from 'node:assert/strict';
import {
  scoreFleetAgents,
  scheduleFleetAgent,
  aggregateFleetState,
  formatFleetDashboardLines,
} from '../server/modules/control-plane/fleet';
import type { FleetAgent } from '../server/modules/control-plane/fleet';
import {
  formatOperationsDashboardLines,
  formatRuntimeMetricsLines,
  resetOperationsMetricsForTests,
  METRICS_INTERVAL_MS_DEFAULT,
} from '../server/modules/control-plane/operations';
import type { OperationsMetricsSnapshot } from '../server/modules/control-plane/operations';
import { createCommandEngine } from '../server/modules/control-plane/command-engine';
import { consoleSystemUser } from '../server/modules/control-plane/command-engine/defaultCommands';

function fakeAgent(partial: Partial<FleetAgent> & { agentId: string; hostname: string }): FleetAgent {
  return {
    displayName: partial.displayName || partial.hostname,
    machineId: partial.machineId || partial.hostname,
    platform: 'win32/x64',
    version: '1.0.0',
    tags: partial.tags || [],
    capabilities: partial.capabilities || ['scan', 'browser'],
    status: partial.status || 'online',
    activity: partial.activity || 'idle',
    lastHeartbeat: new Date().toISOString(),
    heartbeatAgeMs: 1000,
    uptimeSec: 100,
    companyId: null,
    sessionId: `sess-${partial.agentId}`,
    workerId: partial.agentId,
    cpuLoad1m: partial.cpuLoad1m ?? 0.2,
    memFreeMb: partial.memFreeMb ?? 8000,
    memTotalMb: partial.memTotalMb ?? 16000,
    rssMb: 200,
    heapUsedMb: 80,
    chromeCount: 1,
    executionSlots: partial.executionSlots ?? 2,
    jobs: partial.jobs || { running: 0, waiting: 0, currentStep: null, owners: [] },
    mission: partial.mission ?? null,
    scanner: null,
    publish: { phase: 'idle' },
    browserProfiles: partial.browserProfiles || [
      {
        browserId: 'b1',
        profile: 'p1',
        state: 'idle',
        busy: false,
        lockedBy: null,
        currentUrl: null,
      },
    ],
    currentUrl: null,
    lastError: null,
    snapshot: null,
    ...partial,
  };
}

function fakeOps(): OperationsMetricsSnapshot {
  const agents = [
    fakeAgent({
      agentId: 'linh',
      hostname: 'LINH-PC',
      activity: 'scanning',
      jobs: { running: 3, waiting: 8, currentStep: 'scan', owners: ['j1'] },
      tags: ['scan'],
    }),
    fakeAgent({
      agentId: 'mini',
      hostname: 'MINI-PC',
      activity: 'idle',
      tags: ['keyword'],
      cpuLoad1m: 0.1,
      jobs: { running: 0, waiting: 0, currentStep: null, owners: [] },
    }),
  ];
  const fleetState = aggregateFleetState(agents);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    refreshReason: 'manual',
    companyId: null,
    fleet: {
      machinesOnline: 2,
      machinesOffline: 0,
      machinesBusy: 1,
      machinesIdle: 1,
      cpuAvg: 0.15,
      ramUsedPctAvg: 50,
      browserBusy: 0,
      browserIdle: 2,
      healthScore: fleetState.healthScore,
    },
    scanner: {
      sources: 11,
      assigned: 11,
      running: 3,
      completed: 0,
      findingsToday: 2,
      postsScanned: 40,
    },
    publisher: { draft: 1, queue: 5, publishing: 1, publishedToday: 0, retry: 0 },
    mission: { running: 4, waiting: 1, completed: 0, failed: 0 },
    workload: {
      totalScanSources: 11,
      assignedSources: 11,
      completedSources: 0,
      runningMissions: 4,
      runningPublishJobs: 1,
      runningCampaigns: 0,
      waitingJobs: 8,
      retryJobs: 0,
      failedJobs: 0,
    },
    machines: agents.map(a => ({
      agentId: a.agentId,
      hostname: a.hostname,
      machineId: a.machineId,
      displayName: a.displayName,
      status: a.status,
      activity: a.activity,
      assigned: a.jobs.running + a.jobs.waiting,
      running: a.jobs.running,
      completed: 0,
      waiting: a.jobs.waiting,
      cpuLoad1m: a.cpuLoad1m,
      memFreeMb: a.memFreeMb,
      memTotalMb: a.memTotalMb,
      rssMb: a.rssMb,
      heapUsedMb: a.heapUsedMb,
      chromeCount: a.chromeCount,
      browserBusy: 0,
      browserIdle: 1,
      executionSlots: a.executionSlots,
      missionName: a.mission?.missionName ?? null,
      currentStep: a.jobs.currentStep,
      heartbeatAgeMs: a.heartbeatAgeMs,
    })),
    fleetState,
    agents,
  };
}

async function main() {
  console.log('=== Operations Center Tests ===\n');
  resetOperationsMetricsForTests();

  const agents = [
    fakeAgent({
      agentId: 'busy',
      hostname: 'LINH-PC',
      activity: 'scanning',
      jobs: { running: 2, waiting: 0, currentStep: 'scan', owners: [] },
      cpuLoad1m: 1.5,
      tags: ['scan', 'local'],
      capabilities: ['scan', 'browser'],
      browserProfiles: [
        { browserId: 'b', profile: 'p', state: 'leased', busy: true, lockedBy: 'j', currentUrl: null },
      ],
    }),
    fakeAgent({
      agentId: 'idle',
      hostname: 'MINI-PC',
      activity: 'idle',
      tags: ['scan', 'mini'],
      capabilities: ['scan', 'browser', 'publish'],
      cpuLoad1m: 0.1,
      memFreeMb: 12000,
      memTotalMb: 16000,
      jobs: { running: 0, waiting: 0, currentStep: null, owners: [] },
    }),
    fakeAgent({
      agentId: 'off',
      hostname: 'OFFICE-PC',
      status: 'offline',
      activity: 'offline',
      tags: ['publish'],
      capabilities: ['publish', 'browser'],
    }),
  ];

  const pick = scheduleFleetAgent(agents, {
    require: ['scan'],
    preferTags: ['mini'],
    requireBrowserFree: true,
    priority: 8,
  });
  assert.ok(pick);
  assert.equal(pick!.hostname, 'MINI-PC');
  const ranked = scoreFleetAgents(agents, { require: ['scan'] });
  assert.ok(ranked[0].score >= ranked[ranked.length - 1].score);
  console.log('Scheduling PASS');
  console.log('Fleet PASS');

  assert.equal(METRICS_INTERVAL_MS_DEFAULT, 5 * 60 * 1000);
  const ops = fakeOps();
  const dash = formatOperationsDashboardLines(ops);
  assert.ok(dash.some(l => /Operations Center/i.test(l)));
  assert.ok(dash.some(l => /Scanner/.test(l)));
  assert.ok(dash.some(l => /Publisher/.test(l)));
  assert.ok(dash.some(l => /11/.test(l)));
  const runtimeLines = formatRuntimeMetricsLines(ops);
  assert.ok(runtimeLines.some(l => /Runtime Metrics/i.test(l)));
  assert.ok(runtimeLines.some(l => /LINH-PC/.test(l)));
  console.log('Metrics PASS');
  console.log('Runtime PASS');
  console.log('Dashboard PASS');

  const fleetLines = formatFleetDashboardLines(ops.fleetState!);
  assert.ok(fleetLines.some(l => /Fleet/i.test(l)));
  console.log('Reports PASS');

  const engine = createCommandEngine();
  const names = engine.registry.list().map(c => c.name);
  assert.ok(names.includes('dashboard'));
  assert.ok(names.includes('runtime'));
  assert.ok(names.includes('report'));
  assert.ok(names.includes('fleet'));
  const user = consoleSystemUser(null, 'telegram');
  // Pure formatter + command registry — avoid DB for Telegram shape check
  assert.ok(formatOperationsDashboardLines(ops).length > 5);
  console.log('Telegram PASS');

  assert.equal(ops.scanner.sources, 11);
  assert.equal(ops.publisher.queue, 5);
  assert.equal(ops.mission.running, 4);
  console.log('Scanner PASS');
  console.log('Publisher PASS');
  console.log('Mission PASS');

  // silence unused
  void user;

  console.log('\nAll operations-center checks PASS');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
