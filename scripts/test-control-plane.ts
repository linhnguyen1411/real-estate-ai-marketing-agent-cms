/**
 * Control Plane tests — Agent Registry, Runtime API, Events, Reports, Telegram.
 * Run: npx tsx scripts/test-control-plane.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AutomationEngine } from '../server/modules/automation-engine/automationEngine';
import { ControlPlane } from '../server/modules/control-plane';
import { sessionToAgentNode, buildAgentRegistryMetadata } from '../server/modules/control-plane/agentRegistry';
import { selectAgent } from '../server/modules/control-plane/agentSelector';
import { emitRuntimeEvent, listRuntimeEvents, isRuntimeEventType } from '../server/modules/control-plane/runtimeEventBus';
import { RUNTIME_EVENT_TYPES } from '../server/modules/control-plane/types';
import type { AgentNode } from '../server/modules/control-plane/types';
import { handleTelegramControlCommand } from '../server/modules/control-plane/telegramRemoteConsole';

function fakeAgent(partial: Partial<AgentNode> & Pick<AgentNode, 'agentId'>): AgentNode {
  return {
    agentId: partial.agentId,
    hostname: partial.hostname ?? 'host-a',
    version: partial.version ?? '1.0.0',
    capabilities: partial.capabilities ?? ['scan', 'publish', 'browser'],
    status: partial.status ?? 'online',
    heartbeatAt: new Date().toISOString(),
    heartbeatAgeMs: 1000,
    companyId: null,
    sessionId: 'sess-' + partial.agentId,
    workerId: partial.workerId ?? partial.agentId,
    executionSlots: partial.executionSlots ?? [],
    browserPool: partial.browserPool ?? [],
    metrics: {
      pid: 1,
      rssMb: 100,
      heapUsedMb: 50,
      uptimeSec: 10,
      slotUtilization: partial.metrics?.slotUtilization ?? 0,
      browserUtilization: null,
      ...partial.metrics,
    },
    currentUrl: null,
    lastError: null,
  };
}

async function testMultiAgentRegistration() {
  const meta = buildAgentRegistryMetadata({
    workerId: 'worker-test-1',
    browserMode: 'managed',
    capabilities: ['scan', 'publish', 'browser'],
    version: '9.9.9',
  });
  assert.equal(meta.agentId, 'worker-test-1');
  assert.ok(typeof meta.hostname === 'string');
  assert.equal(meta.version, '9.9.9');
  assert.ok(Array.isArray(meta.capabilities));

  const node = sessionToAgentNode({
    id: 'sess1',
    companyId: null,
    name: 'Test',
    status: 'ready',
    workerId: 'worker-test-1',
    profilePath: '/tmp',
    currentUrl: null,
    lastHeartbeatAt: new Date(),
    lastError: null,
    metadata: meta,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);

  assert.equal(node.agentId, 'worker-test-1');
  assert.equal(node.status, 'online');
  assert.ok(node.capabilities.includes('scan'));

  const local = fakeAgent({
    agentId: 'local-pc',
    hostname: 'PC-A',
    capabilities: ['scan', 'publish', 'browser'],
  });
  local.metrics.slotUtilization = 80;

  const mini = fakeAgent({
    agentId: 'mini-pc',
    hostname: 'MINI',
    capabilities: ['scan', 'publish', 'browser'],
  });
  mini.metrics.slotUtilization = 10;

  const vps = fakeAgent({
    agentId: 'vps-1',
    hostname: 'VPS',
    capabilities: ['publish', 'browser'],
    status: 'online',
  });

  const pickedScan = selectAgent([local, mini, vps], { require: ['scan'] });
  assert.equal(pickedScan?.agentId, 'mini-pc', 'lowest util with scan');

  const pickedPreferred = selectAgent([local, mini, vps], {
    require: ['publish'],
    preferredAgentId: 'vps-1',
  });
  assert.equal(pickedPreferred?.agentId, 'vps-1');

  const offlineOnly = selectAgent(
    [fakeAgent({ agentId: 'x', status: 'offline' })],
    { require: ['scan'] },
  );
  assert.equal(offlineOnly, null);

  console.log('✓ multi-agent registration + selection');
}

async function testRuntimeApi() {
  const desc = ControlPlane.describe();
  assert.equal(desc.name, 'ControlPlane');
  assert.ok(desc.eventTypes.includes('JOB_CLAIMED'));
  assert.ok(AutomationEngine.controlPlane === ControlPlane);
  const engine = AutomationEngine.describe();
  assert.ok(engine.runtimes.controlPlane);

  const { checkDatabaseConnection } = await import('../server/prisma');
  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.log('⚠ skip live Runtime API (DB unavailable)');
    return;
  }

  const user = {
    id: 'test',
    name: 'test',
    email: 't@local',
    role: 'owner' as const,
  };
  const snap = await ControlPlane.getRuntime(user);
  assert.ok('healthScore' in snap);
  assert.ok(Array.isArray(snap.agents));
  assert.ok(Array.isArray(snap.events));
  assert.ok(snap.controlPlane?.version === 1);
  console.log('✓ Runtime API');
}

async function testRuntimeEvents() {
  for (const t of RUNTIME_EVENT_TYPES) {
    assert.ok(isRuntimeEventType(t));
  }

  const { checkDatabaseConnection } = await import('../server/prisma');
  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.log('⚠ skip live Runtime Event (DB unavailable)');
    return;
  }

  await emitRuntimeEvent({
    type: 'AGENT_ONLINE',
    agentId: 'test-agent-cp',
    entityType: 'agent',
    entityId: 'test-agent-cp',
    payload: { test: true },
  });
  await emitRuntimeEvent({
    type: 'JOB_CREATED',
    agentId: 'test-agent-cp',
    entityType: 'job',
    entityId: 'job-test-cp',
    payload: { test: true },
  });

  const events = await listRuntimeEvents({ agentId: 'test-agent-cp', limit: 10 });
  assert.ok(events.length >= 1);
  assert.ok(events.some(e => e.type === 'AGENT_ONLINE' || e.type === 'JOB_CREATED'));
  console.log('✓ Runtime Event');
}

async function testReport() {
  const { checkDatabaseConnection } = await import('../server/prisma');
  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.log('⚠ skip Report (DB unavailable)');
    return;
  }
  const user = {
    id: 'test',
    name: 'test',
    email: 't@local',
    role: 'owner' as const,
  };
  for (const kind of [
    'daily',
    'weekly',
    'campaign',
    'publish',
    'scanner',
    'runtime_health',
  ] as const) {
    const report = await ControlPlane.report(user, kind);
    assert.equal(report.kind, kind);
    assert.equal(report.dataSource, 'runtime_api');
    assert.ok('healthScore' in report);
  }
  console.log('✓ Report');
}

async function testTelegramCommand() {
  const help = await handleTelegramControlCommand('/help');
  assert.equal(help.ok, true);
  assert.match(help.text, /health/);

  const { checkDatabaseConnection } = await import('../server/prisma');
  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.log('⚠ skip Telegram live commands (DB unavailable)');
    return;
  }

  const health = await ControlPlane.telegramCommand('/health');
  assert.equal(health.ok, true);
  assert.match(health.text, /Health/);

  const agents = await ControlPlane.telegramCommand('/agents');
  assert.equal(agents.ok, true);

  const runtime = await ControlPlane.telegramCommand('/runtime');
  assert.equal(runtime.ok, true);

  const missions = await ControlPlane.telegramCommand('/missions');
  assert.equal(missions.ok, true);

  const report = await ControlPlane.telegramCommand('/report today');
  assert.equal(report.ok, true);

  const publish = await ControlPlane.telegramCommand('/publish now');
  assert.equal(publish.ok, true);

  const bad = await ControlPlane.telegramCommand('/nope');
  assert.equal(bad.ok, false);

  console.log('✓ Telegram Command');
}

async function testWiringFiles() {
  const root = process.cwd();
  const files = [
    'server/modules/control-plane/index.ts',
    'server/modules/control-plane/agentRegistry.ts',
    'server/modules/control-plane/runtimeEventBus.ts',
    'server/modules/control-plane/reportEngine.ts',
    'server/modules/control-plane/telegramRemoteConsole.ts',
    'docs/architecture/CONTROL-PLANE.md',
  ];
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
  }
  console.log('✓ wiring files');
}

async function main() {
  console.log('Control Plane tests');
  await testMultiAgentRegistration();
  await testWiringFiles();
  await testRuntimeEvents();
  await testRuntimeApi();
  await testReport();
  await testTelegramCommand();
  console.log('\nCONTROL PLANE TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
