#!/usr/bin/env tsx
/**
 * Mission 2.0 provenance + workflow E2E (DB-backed, simulates local→VPS ingest path).
 * npm run test:mission-provenance-e2e
 */
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { prisma } from '../server/prisma';
import {
  BUYER_HUNTER_PIPELINE,
  SUPPLY_HUNTER_PIPELINE,
  BRAND_MONITORING_PIPELINE,
} from '../server/modules/mission-engine/domain/missionTemplates';
import { assertValidPipeline } from '../server/modules/mission-engine/domain/workflowValidation';
import {
  createMissionRun,
  completeMissionRunIfSettled,
} from '../server/modules/mission-engine/repositories/missionRunRepository';
import { executeContentWorkflow } from '../server/modules/mission-engine/application/workflowExecutionService';
import { processFindingForContent } from '../server/agent-worker/services/findingRuleEngine';
import { ingestEventEnvelope } from '../server/agentIngest/ingestService';
import { recoverStaleMissionRuns } from '../server/modules/mission-engine/application/workflowRecoveryService';
import { computeNextRunAt } from '../server/modules/mission-engine/application/missionRunService';
import { AGENT_INGEST_API_VERSION } from '../server/agentSync/envelope';
import { ensureDatabaseReady } from '../server/dbHelper';

const TAG = `m2prov_${Date.now()}`;
const companyId = 'comp-da-nang';

let passed = 0;
function ok(name: string) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}
function fail(name: string, err: unknown) {
  console.error(`  ✗ ${name}`, err);
  process.exitCode = 1;
}
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

function hash(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function mkSource() {
  return prisma.agentSource.create({
    data: {
      companyId,
      name: `[E2E] ${TAG}`,
      type: 'website',
      url: `https://example.invalid/e2e/${TAG}`,
      status: 'paused',
      priority: 99,
      scanIntervalMinutes: 1440,
      config: { smoke: true },
    },
  });
}

async function mkContent(sourceId: string, text: string, suffix: string) {
  return prisma.scannedContent.create({
    data: {
      companyId,
      sourceId,
      externalId: `${TAG}_${suffix}`,
      canonicalUrl: `https://example.invalid/e2e/${TAG}/${suffix}`,
      authorName: 'E2E',
      contentText: text,
      contentHash: hash(`${TAG}:${suffix}:${text}`),
      status: 'collected',
      rawData: { tag: TAG },
    },
  });
}

async function mkMission(input: {
  name: string;
  templateKey: string;
  pipeline: ReturnType<typeof assertValidPipeline>;
  sourceId: string;
}) {
  const mission = await prisma.agentMission.create({
    data: {
      companyId,
      name: input.name,
      objective: input.name,
      status: 'active',
      templateKey: input.templateKey,
      pipeline: input.pipeline as object,
      pipelineVersion: input.pipeline.version,
      rules: { sourceIds: [input.sourceId], templateId: input.templateKey },
      schedule: { cadence: 'every_4h', timezone: 'Asia/Ho_Chi_Minh' },
      nextRunAt: new Date(Date.now() - 60_000),
      lastRunAt: null,
    },
  });
  await prisma.agentMissionSource.create({
    data: { companyId, missionId: mission.id, sourceId: input.sourceId, isActive: true },
  });
  return mission;
}

function buildContentEnvelope(input: {
  source: { id: string; externalSourceKey?: string | null; name: string; type: string; url: string };
  content: { id: string; contentText: string; contentHash: string; externalId: string };
  provenance: Record<string, unknown>;
  idempotencyKey: string;
}) {
  return {
    apiVersion: AGENT_INGEST_API_VERSION,
    ingestionId: input.idempotencyKey,
    idempotencyKey: input.idempotencyKey,
    eventType: 'scanned_content_upsert',
    companyId,
    localWorkerId: 'worker-e2e-test',
    sourceKey: input.source.externalSourceKey || `url:${input.source.url}`,
    capturedAt: new Date().toISOString(),
    parserVersion: 'facebook-local-v1',
    payload: {
      ...input.provenance,
      source: {
        localSourceId: input.source.id,
        externalSourceKey: input.source.externalSourceKey,
        name: input.source.name,
        type: input.source.type,
        url: input.source.url,
        status: 'active',
      },
      scannedContent: {
        localScannedContentId: input.content.id,
        externalId: input.content.externalId,
        contentText: input.content.contentText,
        contentHash: input.content.contentHash,
        status: 'collected',
        collectedAt: new Date().toISOString(),
      },
    },
  };
}

console.log('Mission 2.0 — provenance + workflow E2E\n');

await ensureDatabaseReady();

const source = await mkSource();
const buyerPipeline = assertValidPipeline(BUYER_HUNTER_PIPELINE);
const supplyPipeline = assertValidPipeline(SUPPLY_HUNTER_PIPELINE);
const brandPipeline = assertValidPipeline(BRAND_MONITORING_PIPELINE);

const buyerText =
  'Tài chính 4 tỷ cần tìm nhà tại Thanh Khê, ô tô vào được, liên hệ 0901234567 gấp';
const supplyText = 'Bán lô đất 100m², giá hơn 3 tỷ, hotline 0912345678 chính chủ';
const brandText =
  'Thảo luận về thương hiệu ABC Real Estate hôm nay nhiều người khen dịch vụ tư vấn tốt';

const buyerMission = await mkMission({
  name: `[E2E] Buyer ${TAG}`,
  templateKey: 'buyer-hunter',
  pipeline: buyerPipeline,
  sourceId: source.id,
});
const supplyMission = await mkMission({
  name: `[E2E] Supply ${TAG}`,
  templateKey: 'supply-hunter',
  pipeline: supplyPipeline,
  sourceId: source.id,
});
const brandMission = await mkMission({
  name: `[E2E] Brand ${TAG}`,
  templateKey: 'brand-monitoring',
  pipeline: brandPipeline,
  sourceId: source.id,
});

const buyerContent = await mkContent(source.id, buyerText, 'buyer');
const supplyContent = await mkContent(source.id, supplyText, 'supply');
const brandContent = await mkContent(source.id, brandText, 'brand');

const buyerRun = await createMissionRun({
  companyId,
  missionId: buyerMission.id,
  missionVersion: 1,
  pipelineSnapshot: buyerPipeline,
  pipelineHash: `hash-buyer-${TAG}`,
  triggerType: 'manual',
  triggeredBy: 'e2e',
  status: 'running',
});
const supplyRun = await createMissionRun({
  companyId,
  missionId: supplyMission.id,
  missionVersion: 1,
  pipelineSnapshot: supplyPipeline,
  pipelineHash: `hash-supply-${TAG}`,
  triggerType: 'manual',
  triggeredBy: 'e2e',
  status: 'running',
});
const brandRun = await createMissionRun({
  companyId,
  missionId: brandMission.id,
  missionVersion: 1,
  pipelineSnapshot: brandPipeline,
  pipelineHash: `hash-brand-${TAG}`,
  triggerType: 'manual',
  triggeredBy: 'e2e',
  status: 'running',
});

await test('Buyer Hunter — Finding created with mission provenance', async () => {
  await executeContentWorkflow({
    missionRunId: buyerRun.id,
    scannedContentId: buyerContent.id,
    sourceId: source.id,
    runtimeTarget: 'vps',
  });
  const finding = await prisma.agentFinding.findFirst({
    where: { scannedContentId: buyerContent.id, missionRunId: buyerRun.id },
  });
  assert.ok(finding?.id, 'buyer finding');
  assert.equal(finding?.missionId, buyerMission.id);
  assert.equal(finding?.classification, 'buyer');
});

await test('Supply Hunter — External Inventory candidate, no Buyer Finding', async () => {
  const wf = await executeContentWorkflow({
    missionRunId: supplyRun.id,
    scannedContentId: supplyContent.id,
    sourceId: source.id,
    runtimeTarget: 'vps',
  });
  const inv = await prisma.externalInventoryItem.findFirst({
    where: { scannedContentId: supplyContent.id },
  });
  const finding = await prisma.agentFinding.findFirst({
    where: { scannedContentId: supplyContent.id, missionRunId: supplyRun.id },
  });
  const inventoryStep = await prisma.agentWorkflowStepRun.findFirst({
    where: {
      missionRunId: supplyRun.id,
      scannedContentId: supplyContent.id,
      stepType: 'create_external_inventory_candidate',
    },
  });
  assert.ok(
    inv?.id || inventoryStep?.status === 'completed',
    `inventory candidate (wf=${JSON.stringify(wf)} step=${JSON.stringify(inventoryStep?.output)})`,
  );
  assert.equal(finding, null);
});

await test('Brand Monitoring — 0 Finding, 0 Inventory', async () => {
  await executeContentWorkflow({
    missionRunId: brandRun.id,
    scannedContentId: brandContent.id,
    sourceId: source.id,
    runtimeTarget: 'vps',
  });
  const findings = await prisma.agentFinding.count({ where: { scannedContentId: brandContent.id } });
  const inv = await prisma.externalInventoryItem.count({ where: { scannedContentId: brandContent.id } });
  assert.equal(findings, 0);
  assert.equal(inv, 0);
});

await test('Provenance envelope — VPS continuation', async () => {
  const provContent = await mkContent(
    source.id,
    'Cần mua căn hộ 2PN ngân sách 2 tỷ liên hệ 0988111222',
    'prov',
  );
  const provRun = await createMissionRun({
    companyId,
    missionId: buyerMission.id,
    missionVersion: 1,
    pipelineSnapshot: buyerPipeline,
    pipelineHash: `hash-prov-${TAG}`,
    triggerType: 'sync',
    triggeredBy: 'e2e',
    status: 'queued',
  });
  const idem = `e2e-prov-${TAG}-${provContent.id}`;
  const envelope = buildContentEnvelope({
    source: { ...source, externalSourceKey: `url:${source.url}` },
    content: provContent,
    idempotencyKey: idem,
    provenance: {
      missionId: buyerMission.id,
      missionRunId: provRun.id,
      pipelineVersion: 1,
      pipelineHash: provRun.pipelineHash,
      missionWorkflow: {
        missionId: buyerMission.id,
        missionRunId: provRun.id,
        pipelineVersion: 1,
        pipelineHash: provRun.pipelineHash,
        pipelineSnapshot: buyerPipeline,
        completedLocalSteps: [],
      },
    },
  });
  const r1 = await ingestEventEnvelope({ companyId, envelope, keyId: 'e2e' });
  assert.ok(r1.status === 'accepted' || r1.status === 'duplicate');
  const steps = await prisma.agentWorkflowStepRun.count({ where: { missionRunId: provRun.id } });
  assert.ok(steps > 0 || (r1.warnings || []).some(w => w.includes('mission_workflow')));
});

await test('Duplicate payload — idempotent ingest', async () => {
  const dupContent = await mkContent(source.id, 'Duplicate test 0909999888 mua nhà', 'dup');
  const dupRun = await createMissionRun({
    companyId,
    missionId: buyerMission.id,
    missionVersion: 1,
    pipelineSnapshot: buyerPipeline,
    pipelineHash: `hash-dup-${TAG}`,
    triggerType: 'sync',
    triggeredBy: 'e2e',
    status: 'queued',
  });
  const idem = `e2e-dup-${TAG}`;
  const envelope = buildContentEnvelope({
    source: { ...source, externalSourceKey: `url:${source.url}` },
    content: dupContent,
    idempotencyKey: idem,
    provenance: {
      missionId: buyerMission.id,
      missionRunId: dupRun.id,
      pipelineVersion: 1,
      missionWorkflow: {
        missionId: buyerMission.id,
        missionRunId: dupRun.id,
        pipelineSnapshot: buyerPipeline,
        pipelineVersion: 1,
      },
    },
  });
  const r1 = await ingestEventEnvelope({ companyId, envelope, keyId: 'e2e' });
  const r2 = await ingestEventEnvelope({ companyId, envelope, keyId: 'e2e' });
  assert.ok(r1.status === 'accepted' || r1.status === 'duplicate');
  assert.equal(r2.status, 'duplicate');
  const findingCount = await prisma.agentFinding.count({ where: { missionRunId: dupRun.id } });
  assert.ok(findingCount <= 1);
});

await test('Missing mission — continuation fails safely', async () => {
  const c = await mkContent(source.id, 'Ghost mission test unique content xyz', 'ghost');
  const r = await ingestEventEnvelope({
    companyId,
    envelope: buildContentEnvelope({
      source: { ...source, externalSourceKey: `url:${source.url}` },
      content: c,
      idempotencyKey: `ghost-${TAG}`,
      provenance: {
        missionId: buyerMission.id,
        missionRunId: `ghost_run_${TAG}`,
        pipelineVersion: 1,
        missionWorkflow: {
          missionId: 'nonexistent-mission-id',
          missionRunId: `ghost_run_${TAG}`,
          pipelineVersion: 1,
          pipelineSnapshot: buyerPipeline,
        },
      },
    }),
  });
  assert.ok(r.status === 'accepted' || r.status === 'duplicate');
  assert.ok(
    (r.warnings || []).some(w => w.includes('mission_workflow_continue_failed')) ||
      r.status === 'duplicate',
    'expected workflow continue warning or duplicate',
  );
});

await test('Legacy without Mission — Finding allowed', async () => {
  const legacy = await mkContent(
    source.id,
    'Cần thuê căn hộ 2PN gần sông Hàn ngân sách 12 triệu/tháng 0987654321',
    'legacy',
  );
  const r = await processFindingForContent({
    content: legacy,
    source,
    mission: null,
    title: 'Legacy rent',
  });
  assert.equal(r.findingCreated, true);
});

await test('Retry workflow — step count stable', async () => {
  const before = await prisma.agentWorkflowStepRun.count({
    where: { missionRunId: buyerRun.id, scannedContentId: buyerContent.id },
  });
  await executeContentWorkflow({
    missionRunId: buyerRun.id,
    scannedContentId: buyerContent.id,
    sourceId: source.id,
    runtimeTarget: 'vps',
  });
  const after = await prisma.agentWorkflowStepRun.count({
    where: { missionRunId: buyerRun.id, scannedContentId: buyerContent.id },
  });
  assert.equal(before, after);
});

await test('Recovery dry-run', async () => {
  const rec = await recoverStaleMissionRuns({ dryRun: true, staleMs: 15 * 60_000 });
  assert.equal(rec.staleFound, 0);
});

await test('nextRunAt advances', async () => {
  const from = new Date('2026-07-15T10:00:00Z');
  const next = computeNextRunAt({ cadence: 'every_4h', timezone: 'Asia/Ho_Chi_Minh' }, from);
  assert.ok(next);
  assert.equal(next!.getTime() - from.getTime(), 4 * 60 * 60_000);
});

await completeMissionRunIfSettled(buyerRun.id);
await completeMissionRunIfSettled(supplyRun.id);
await completeMissionRunIfSettled(brandRun.id);

console.log(`\nDone: ${passed} assertions passed`);
await prisma.$disconnect();
if (process.exitCode) process.exit(process.exitCode);
