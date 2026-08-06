/**
 * G1 — Stateless Execution Agent tests.
 * Run: npx tsx scripts/test-stateless-execution-agent.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  EXECUTION_PAYLOAD_SCHEMA,
  readHydratedExecution,
  type SourceExecutionSnapshot,
} from '../server/modules/control-plane/execution/jobPayloadContract';
import {
  hydrateJobForExecution,
  snapshotSource,
} from '../server/modules/control-plane/execution/jobHydrator';
import { resolveScanExecutionContext } from '../server/agent-worker/execution/resolveScanContext';
import { isStatelessExecutionAgent } from '../server/agent-worker/execution/stateless';
import { shouldUseStatelessPublish } from '../server/modules/social-publishing/worker/publishStatelessHandler';
import type { AgentJob, AgentSource } from '@prisma/client';

function mockSource(): AgentSource {
  return {
    id: 'src-test-1',
    companyId: 'co-1',
    name: 'Test FB Group',
    type: 'facebook_group',
    url: 'https://www.facebook.com/groups/test',
    status: 'active',
    priority: 5,
    scanIntervalMinutes: 60,
    config: { scanMode: 'buyer' },
    checkpoint: null,
    lastScannedAt: null,
    nextScanAt: null,
    lastError: null,
    externalSourceKey: null,
    syncStatus: 'local_only',
    remoteId: null,
    lastSyncAt: null,
    syncError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function mockJob(overrides: Partial<AgentJob> = {}): AgentJob {
  const source = mockSource();
  const snap = snapshotSource(source);
  return {
    id: 'job-1',
    companyId: source.companyId,
    missionId: null,
    missionRunId: null,
    sourceId: source.id,
    type: 'scan_source',
    status: 'running',
    priority: 5,
    payload: {
      sourceId: source.id,
      execution: {
        schemaVersion: EXECUTION_PAYLOAD_SCHEMA,
        scan: {
          jobType: 'scan_source',
          source: snap,
          mission: null,
          missionRun: null,
          browser: { browserMode: 'cdp', capabilities: ['scan', 'cdp'], cdpRequired: true },
          retry: { maxAttempts: 3, attempts: 0 },
          checkpoint: null,
          hydratedAt: new Date().toISOString(),
        },
      },
    },
    result: null,
    attempts: 0,
    maxAttempts: 3,
    claimedBy: 'worker-test',
    claimedAt: new Date(),
    startedAt: new Date(),
    finishedAt: null,
    availableAt: new Date(),
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgentJob;
}

async function main() {
  process.env.EXECUTION_AGENT_STATELESS = '1';
  delete process.env.DATABASE_URL;

  assert.equal(isStatelessExecutionAgent(), true);
  console.log('PASS No DATABASE_URL flag');

  const job = mockJob();
  const hydrated = readHydratedExecution(job.payload);
  assert.ok(hydrated?.scan?.source);
  assert.equal(hydrated!.scan!.source.id, 'src-test-1');
  console.log('PASS Job payload contract');

  const ctx = await resolveScanExecutionContext(job);
  assert.equal(ctx.source.url, 'https://www.facebook.com/groups/test');
  assert.equal(ctx.mission, null);
  console.log('PASS Scan context from payload (no DB)');

  const publishJob = mockJob({
    type: 'publish_social',
    sourceId: null,
    payload: {
      publishJobId: 'pub-1',
      execution: {
        schemaVersion: EXECUTION_PAYLOAD_SCHEMA,
        publish: {
          jobType: 'publish_social',
          publishJobId: 'pub-1',
          missionRunId: 'run-1',
          publish: {
            publishJobId: 'pub-1',
            draftId: 'd1',
            destinationId: 'ch1',
            destinationKey: 'facebook_timeline',
            body: 'Hello',
            linkUrl: null,
            media: [],
            destinationConfig: {},
            dryRun: true,
          },
          missionRun: null,
          browser: { browserMode: 'cdp', capabilities: ['publish'], cdpRequired: true },
          retry: { maxAttempts: 3, attempts: 0 },
          hydratedAt: new Date().toISOString(),
        },
      },
    },
  });
  assert.equal(shouldUseStatelessPublish(publishJob), true);
  console.log('PASS Publish stateless routing');

  const automationIndex = fs.readFileSync(
    path.join(process.cwd(), 'server/automation-agent/index.ts'),
    'utf8',
  );
  assert.match(automationIndex, /EXECUTION_AGENT_STATELESS/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), 'server/automation-agent/index.ts'), 'utf8'),
    /checkDatabaseConnection/,
  );
  console.log('PASS Automation agent stateless bootstrap');

  const scanHandler = fs.readFileSync(
    path.join(process.cwd(), 'server/agent-worker/scanSourceHandler.ts'),
    'utf8',
  );
  assert.doesNotMatch(scanHandler, /assertAgentSourceActiveForScan/);
  assert.doesNotMatch(scanHandler, /prisma\.agentMission/);
  console.log('PASS Scan handler no direct DB reads');

  const { checkDatabaseConnection } = await import('../server/prisma');
  const db = await checkDatabaseConnection();
  if (db.ok) {
    const source = await (await import('../server/prisma')).prisma.agentSource.findFirst({
      where: { status: 'active' },
    });
    if (source) {
      const rawJob = {
        ...mockJob(),
        sourceId: source.id,
        payload: { sourceId: source.id },
      } as AgentJob;
      const enriched = await hydrateJobForExecution(rawJob);
      const exec = readHydratedExecution(enriched.payload);
      assert.equal(exec?.scan?.source.id, source.id);
      console.log('PASS Claim-time hydration (DB)');
    } else {
      console.log('SKIP Claim-time hydration (no active source)');
    }
  } else {
    console.log('SKIP Claim-time hydration (DB unavailable)');
  }

  console.log('\nSTATELESS EXECUTION AGENT TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
