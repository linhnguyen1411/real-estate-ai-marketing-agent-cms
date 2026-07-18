/**
 * Execution Agent tests.
 * Run: npx tsx scripts/test-execution-agent.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  JobHandlerRegistry,
  capabilityForJobType,
  jobTypeAllowedByCapabilities,
} from '../server/agent-worker/ports';
import { createPrismaJobQueuePort } from '../server/agent-worker/prismaJobQueue';
import { createHttpJobQueuePort } from '../server/automation-agent/httpJobQueue';
import { RuntimeAgentClient } from '../server/automation-agent/runtimeClient';
import {
  runtimeAgentRegister,
  runtimeAgentHeartbeat,
  runtimeAgentOffline,
  runtimeAgentClaimJob,
  runtimeAgentCompleteJob,
  runtimeAgentReleaseJob,
} from '../server/modules/control-plane/runtimeAgentService';
import { selectAgent } from '../server/modules/control-plane/agentSelector';
import { listRegisteredAgents } from '../server/modules/control-plane/agentRegistry';
import { prisma } from '../server/prisma';
import { ControlPlane } from '../server/modules/control-plane';

async function testRegistryAdapterNoSwitch() {
  const reg = new JobHandlerRegistry();
  reg.register('health_check', async () => ({ ok: true }));
  reg.register('custom', async () => ({ custom: 1 }));
  assert.equal(reg.has('health_check'), true);
  assert.deepEqual(reg.listTypes().sort(), ['custom', 'health_check']);
  const result = await reg.execute(
    { type: 'health_check' } as never,
    {} as never,
  );
  assert.equal((result as { ok: boolean }).ok, true);
  await assert.rejects(() => reg.execute({ type: 'missing' } as never, {} as never));
  console.log('✓ Agent handler registry (no switch-case)');
}

async function testCapabilities() {
  assert.equal(capabilityForJobType('scan_source'), 'scan');
  assert.equal(capabilityForJobType('publish_social'), 'publish');
  assert.equal(capabilityForJobType('health_check'), null);
  assert.equal(jobTypeAllowedByCapabilities('scan_source', ['publish']), false);
  assert.equal(jobTypeAllowedByCapabilities('scan_source', ['scan']), true);
  assert.equal(jobTypeAllowedByCapabilities('health_check', ['publish']), true);
  console.log('✓ capability mapping');
}

async function testRegisterHeartbeatRecovery() {
  const { checkDatabaseConnection } = await import('../server/prisma');
  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.log('⚠ skip register/heartbeat (DB unavailable)');
    return;
  }

  const agentId = `exec-agent-test-${Date.now()}`;
  const reg = await runtimeAgentRegister({
    agentId,
    hostname: 'test-host',
    version: '1.0.0-test',
    capabilities: ['scan', 'publish', 'browser'],
  });
  assert.ok(reg.sessionId);
  assert.equal(reg.agentId, agentId);

  const hb = await runtimeAgentHeartbeat({
    agentId,
    sessionId: reg.sessionId,
    metadata: {
      executionPool: [{ kind: 'scan', maxConcurrency: 1, runningJobs: 0 }],
      browserPool: [{ browserId: 'b1', purpose: 'scan', state: 'idle' }],
    },
  });
  assert.equal(hb.sessionId, reg.sessionId);

  const agents = await listRegisteredAgents({ onlineOnly: true });
  assert.ok(agents.some(a => a.agentId === agentId));

  // Create a fake running job owned by agent then offline → requeue
  const job = await prisma.agentJob.create({
    data: {
      type: 'health_check',
      status: 'running',
      claimedBy: agentId,
      claimedAt: new Date(),
      startedAt: new Date(),
      availableAt: new Date(),
      payload: { test: true },
    },
  });

  const off = await runtimeAgentOffline({ agentId, requeueJobs: true });
  assert.equal(off.status, 'offline');
  assert.ok(off.requeued >= 1);

  const after = await prisma.agentJob.findUnique({ where: { id: job.id } });
  assert.equal(after?.status, 'queued');
  assert.equal(after?.claimedBy, null);

  await prisma.agentJob.delete({ where: { id: job.id } }).catch(() => undefined);
  console.log('✓ Agent register + heartbeat + recovery');
}

async function testPollExecute() {
  const { checkDatabaseConnection } = await import('../server/prisma');
  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.log('⚠ skip poll/execute (DB unavailable)');
    return;
  }

  const agentId = `exec-poll-${Date.now()}`;
  await runtimeAgentRegister({
    agentId,
    capabilities: ['scan', 'publish', 'browser'],
  });

  const job = await prisma.agentJob.create({
    data: {
      type: 'health_check',
      status: 'queued',
      availableAt: new Date(),
      payload: { pollTest: true, marker: agentId },
      priority: 0,
    },
  });

  let claimed = await runtimeAgentClaimJob({
    agentId,
    capabilities: ['scan', 'publish', 'browser'],
  });
  // Drain until our job or null (avoid flaky older queue noise)
  let guard = 0;
  while (claimed && claimed.id !== job.id && guard < 30) {
    await runtimeAgentCompleteJob(claimed.id, { ok: true, drained: true });
    claimed = await runtimeAgentClaimJob({
      agentId,
      capabilities: ['scan', 'publish', 'browser'],
    });
    guard += 1;
  }
  assert.ok(claimed, 'expected to claim health_check job');
  assert.equal(claimed!.id, job.id);
  assert.equal(claimed!.type, 'health_check');

  await runtimeAgentCompleteJob(job.id, { ok: true, via: 'test' });
  const done = await prisma.agentJob.findUnique({ where: { id: job.id } });
  assert.equal(done?.status, 'completed');

  // Capability filter: publish-only must not claim a scan-typed job we just enqueued
  const scanJob = await prisma.agentJob.create({
    data: {
      type: 'scan_source',
      status: 'queued',
      availableAt: new Date(),
      payload: { capTest: true },
      priority: 0,
    },
  });
  const publishAgent = `pub-only-${Date.now()}`;
  await runtimeAgentRegister({
    agentId: publishAgent,
    capabilities: ['publish'],
  });
  const publishOnly = await runtimeAgentClaimJob({
    agentId: publishAgent,
    capabilities: ['publish'],
  });
  if (publishOnly) {
    assert.notEqual(publishOnly.id, scanJob.id);
    assert.notEqual(publishOnly.type, 'scan_source');
    await runtimeAgentReleaseJob(publishOnly.id, 'test cleanup');
  }
  await prisma.agentJob.update({
    where: { id: scanJob.id },
    data: { status: 'cancelled', finishedAt: new Date(), errorMessage: 'cap test cleanup' },
  });

  console.log('✓ Poll + execute (claim/complete) + capability filter');
}

async function testHttpQueuePort() {
  const calls: string[] = [];
  const fakeClient = {
    async claimJob() {
      calls.push('claim');
      return {
        id: 'job1',
        type: 'health_check',
        status: 'running',
        companyId: null,
        missionId: null,
        missionRunId: null,
        sourceId: null,
        priority: 1,
        payload: {},
        attempts: 0,
        maxAttempts: 3,
        claimedBy: 'a1',
        claimedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      };
    },
    async completeJob(id: string) {
      calls.push(`complete:${id}`);
    },
    async releaseJob(id: string) {
      calls.push(`release:${id}`);
    },
    async requeueJob(id: string) {
      calls.push(`requeue:${id}`);
    },
  } as unknown as RuntimeAgentClient;

  const port = createHttpJobQueuePort(fakeClient, 'a1');
  const job = await port.claimNext('a1', { capabilities: ['scan'] });
  assert.equal(job?.id, 'job1');
  await port.complete('job1', { ok: true });
  await port.release('job1', 'busy');
  await port.requeue('job1', 'shutdown');
  assert.deepEqual(calls, ['claim', 'complete:job1', 'release:job1', 'requeue:job1']);

  const local = createPrismaJobQueuePort();
  assert.equal(typeof local.claimNext, 'function');
  console.log('✓ HTTP JobQueuePort + Prisma port');
}

async function testMultiAgentSelection() {
  const agents = [
    {
      agentId: 'local',
      hostname: 'PC',
      version: '1',
      capabilities: ['scan', 'publish', 'browser'] as const,
      status: 'online' as const,
      heartbeatAt: new Date().toISOString(),
      heartbeatAgeMs: 1000,
      companyId: null,
      sessionId: 's1',
      workerId: 'local',
      executionSlots: [],
      browserPool: [],
      metrics: {
        pid: 1,
        rssMb: 1,
        heapUsedMb: 1,
        uptimeSec: 1,
        slotUtilization: 90,
        browserUtilization: null,
      },
      currentUrl: null,
      lastError: null,
    },
    {
      agentId: 'mini',
      hostname: 'MINI',
      version: '1',
      capabilities: ['scan', 'browser'] as const,
      status: 'online' as const,
      heartbeatAt: new Date().toISOString(),
      heartbeatAgeMs: 500,
      companyId: null,
      sessionId: 's2',
      workerId: 'mini',
      executionSlots: [],
      browserPool: [],
      metrics: {
        pid: 2,
        rssMb: 1,
        heapUsedMb: 1,
        uptimeSec: 1,
        slotUtilization: 5,
        browserUtilization: null,
      },
      currentUrl: null,
      lastError: null,
    },
  ];
  const picked = selectAgent(agents as never, { require: ['scan'] });
  assert.equal(picked?.agentId, 'mini');
  console.log('✓ Multi-agent selection');
}

async function testWiring() {
  const root = process.cwd();
  for (const f of [
    'server/automation-agent/index.ts',
    'server/automation-agent/runtimeClient.ts',
    'server/modules/control-plane/runtimeAgentRoutes.ts',
    'server/modules/control-plane/runtimeAgentService.ts',
    'docs/architecture/EXECUTION-AGENT.md',
  ]) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
  }
  const desc = ControlPlane.describe();
  assert.ok(desc.executionAgent);
  console.log('✓ wiring + ControlPlane.describe');
}

async function main() {
  console.log('Execution Agent tests');
  await testRegistryAdapterNoSwitch();
  await testCapabilities();
  await testHttpQueuePort();
  await testMultiAgentSelection();
  await testWiring();
  await testRegisterHeartbeatRecovery();
  await testPollExecute();
  console.log('\nEXECUTION AGENT TESTS PASSED');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
