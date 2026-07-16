#!/usr/bin/env tsx
/**
 * Dual-host end-to-end: Local missions → HTTPS/HMAC → VPS workflow.
 * npx tsx scripts/run-mission-dual-host-verify.ts
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ensureDatabaseReady, getSettings } from '../server/dbHelper';
import { prisma } from '../server/prisma';
import {
  BUYER_HUNTER_PIPELINE,
  SUPPLY_HUNTER_PIPELINE,
  BRAND_MONITORING_PIPELINE,
} from '../server/modules/mission-engine/domain/missionTemplates';
import { assertValidPipeline } from '../server/modules/mission-engine/domain/workflowValidation';
import { createMissionRun } from '../server/modules/mission-engine/repositories/missionRunRepository';
import { postEnvelopeToVps, testVpsConnection } from '../server/agentSync/vpsClient';
import { AGENT_INGEST_API_VERSION } from '../server/agentSync/envelope';
import type { AppSettings } from '../src/types';
import {
  buildCanonicalString,
  sha256Hex,
  signCanonical,
} from '../server/agentIngest/hmacAuth';

const SESSION = `m2dh_${Date.now()}`;
const companyId = 'comp-da-nang';
const VPS_HOST = process.env.VPS_SSH_HOST || '112.213.87.124';
const VPS_USER = process.env.VPS_SSH_USER || 'root';
const VPS_DIR = '/var/www/real-estate-ai-cms';

type CaseResult = {
  case: string;
  localMissionId: string;
  localRunId: string;
  remoteContentId: string | null;
  remoteFindingId: string | null;
  remoteInventoryId: string | null;
  findingCount: number;
  inventoryCount: number;
  stepCount: number;
  warnings: string[];
  retryDuplicate: boolean;
  status: 'PASS' | 'FAIL';
  error?: string;
};

function hash(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function signedRequest(
  settings: AppSettings,
  method: 'GET' | 'POST',
  urlPath: string,
  body: string | null,
  overrides?: { signature?: string; timestamp?: string; nonce?: string },
) {
  const base = String(settings.agent_sync_vps_url || '').trim().replace(/\/$/, '');
  const url = `${base}${urlPath}`;
  const keyId = String(settings.agent_sync_key_id || '').trim();
  const secret = String(settings.agent_sync_secret || '').trim();
  const bodyHash = sha256Hex(body || '');
  const timestamp = overrides?.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = overrides?.nonce ?? crypto.randomBytes(16).toString('hex');
  const canonical = buildCanonicalString({
    method,
    path: urlPath,
    timestamp,
    nonce,
    bodyHash,
  });
  const signature = overrides?.signature ?? signCanonical(secret, canonical);
  const res = await fetch(url, {
    method,
    headers: {
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      'X-Agent-Key-Id': keyId,
      'X-Agent-Timestamp': timestamp,
      'X-Agent-Nonce': nonce,
      'X-Agent-Signature': signature,
    },
    body: body ?? undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function buildEnvelope(input: {
  idempotencyKey: string;
  missionId: string;
  missionRunId: string;
  pipeline: ReturnType<typeof assertValidPipeline>;
  pipelineHash: string;
  contentText: string;
  contentSuffix: string;
}) {
  const sourceKey = `url:https://example.invalid/verify/${SESSION}/${input.contentSuffix}`;
  return {
    apiVersion: AGENT_INGEST_API_VERSION,
    ingestionId: input.idempotencyKey,
    idempotencyKey: input.idempotencyKey,
    eventType: 'scanned_content_upsert' as const,
    companyId,
    localWorkerId: 'dual-host-verify',
    sourceKey,
    capturedAt: new Date().toISOString(),
    parserVersion: 'dual-host-verify-v1',
    payload: {
      missionId: input.missionId,
      missionRunId: input.missionRunId,
      missionVersion: 1,
      pipelineVersion: 1,
      pipelineHash: input.pipelineHash,
      completedLocalSteps: [
        {
          stepId: 'collect',
          stepType: 'collect_source',
          status: 'completed',
          executionTarget: 'local_worker',
          output: { verification: true, verificationSessionId: SESSION },
          completedAt: new Date().toISOString(),
        },
      ],
      missionWorkflow: {
        missionId: input.missionId,
        missionRunId: input.missionRunId,
        pipelineVersion: 1,
        pipelineHash: input.pipelineHash,
        pipelineSnapshot: input.pipeline,
        completedLocalSteps: [
          {
            stepId: 'collect',
            stepType: 'collect_source',
            status: 'completed',
            executionTarget: 'local_worker',
            output: { verification: true },
            completedAt: new Date().toISOString(),
          },
        ],
        verification: true,
        verificationSessionId: SESSION,
      },
      verification: true,
      verificationSessionId: SESSION,
      source: {
        name: `[VERIFY] Dual-host source ${SESSION}`,
        type: 'website',
        url: `https://example.invalid/verify/${SESSION}`,
        externalSourceKey: sourceKey,
        status: 'paused',
        config: { verification: true, verificationSessionId: SESSION },
      },
      scannedContent: {
        externalId: `verify_${SESSION}_${input.contentSuffix}`,
        contentText: input.contentText,
        contentHash: hash(`${SESSION}:${input.contentSuffix}:${input.contentText}`),
        status: 'collected',
        collectedAt: new Date().toISOString(),
        rawData: { verification: true, verificationSessionId: SESSION },
      },
    },
  };
}

function sshQuery(js: string): string {
  const escaped = js.replace(/'/g, `'\"'\"'`);
  const cmd = `cd ${VPS_DIR} && npx tsx -e '${escaped}'`;
  return execSync(`ssh -o BatchMode=yes ${VPS_USER}@${VPS_HOST} ${JSON.stringify(cmd)}`, {
    encoding: 'utf8',
    timeout: 120_000,
  });
}

async function main() {
  await ensureDatabaseReady();
  const settings = getSettings() as AppSettings;
  const results: CaseResult[] = [];

  console.log(`\n=== Dual-host verify session=${SESSION} ===\n`);

  const health = await testVpsConnection(settings);
  const prov = (health.data as { missionProvenance?: { supported?: boolean } } | undefined)
    ?.missionProvenance;
  if (!health.ok || !prov?.supported) {
    throw new Error('VPS missing missionProvenance.supported — abort');
  }
  console.log('✓ VPS mission provenance supported');

  // HMAC security
  const good = await signedRequest(settings, 'GET', '/api/agent-ingest/v1/health', null);
  if (good.status !== 200) throw new Error('valid HMAC failed');
  console.log('✓ HMAC valid signature');

  const bad = await signedRequest(settings, 'GET', '/api/agent-ingest/v1/health', null, {
    signature: '00'.repeat(32),
  });
  if (bad.status === 200) throw new Error('bad signature accepted');
  console.log('✓ HMAC bad signature rejected');

  const expired = await signedRequest(settings, 'GET', '/api/agent-ingest/v1/health', null, {
    timestamp: String(Math.floor(Date.now() / 1000) - 7200),
  });
  if (expired.status === 200) throw new Error('expired timestamp accepted');
  console.log('✓ HMAC expired timestamp rejected');

  const replayNonce = crypto.randomBytes(16).toString('hex');
  const r1 = await signedRequest(settings, 'GET', '/api/agent-ingest/v1/health', null, {
    nonce: replayNonce,
  });
  const r2 = await signedRequest(settings, 'GET', '/api/agent-ingest/v1/health', null, {
    nonce: replayNonce,
  });
  if (r1.status !== 200) throw new Error('first nonce failed');
  if (r2.status === 200) {
    console.log('⚠ HMAC replay nonce not rejected (limitation — may allow GET health replay)');
  } else {
    console.log('✓ HMAC replay nonce rejected');
  }

  const buyerPipeline = assertValidPipeline(BUYER_HUNTER_PIPELINE);
  const supplyPipeline = assertValidPipeline(SUPPLY_HUNTER_PIPELINE);
  const brandPipeline = assertValidPipeline(BRAND_MONITORING_PIPELINE);

  async function mkMission(name: string, templateKey: string, pipeline: typeof buyerPipeline) {
    return prisma.agentMission.create({
      data: {
        companyId,
        name,
        objective: `[VERIFY] Dual-host ${SESSION}`,
        status: 'paused',
        templateKey,
        pipeline: pipeline as object,
        pipelineVersion: 1,
        rules: { verification: true, verificationSessionId: SESSION, templateId: templateKey },
        schedule: { cadence: 'manual', timezone: 'Asia/Ho_Chi_Minh' },
        nextRunAt: null,
      },
    });
  }

  const buyerMission = await mkMission(
    `[VERIFY] Buyer Hunter Dual Host ${SESSION}`,
    'buyer-hunter',
    buyerPipeline,
  );
  const supplyMission = await mkMission(
    `[VERIFY] Supply Hunter Dual Host ${SESSION}`,
    'supply-hunter',
    supplyPipeline,
  );
  const brandMission = await mkMission(
    `[VERIFY] Brand Monitor Dual Host ${SESSION}`,
    'brand-monitoring',
    brandPipeline,
  );

  const buyerRun = await createMissionRun({
    companyId,
    missionId: buyerMission.id,
    missionVersion: 1,
    pipelineSnapshot: buyerPipeline,
    pipelineHash: `dh-buyer-${SESSION}`,
    triggerType: 'manual',
    triggeredBy: 'dual-host-verify',
    status: 'queued',
  });
  const supplyRun = await createMissionRun({
    companyId,
    missionId: supplyMission.id,
    missionVersion: 1,
    pipelineSnapshot: supplyPipeline,
    pipelineHash: `dh-supply-${SESSION}`,
    triggerType: 'manual',
    triggeredBy: 'dual-host-verify',
    status: 'queued',
  });
  const brandRun = await createMissionRun({
    companyId,
    missionId: brandMission.id,
    missionVersion: 1,
    pipelineSnapshot: brandPipeline,
    pipelineHash: `dh-brand-${SESSION}`,
    triggerType: 'manual',
    triggeredBy: 'dual-host-verify',
    status: 'queued',
  });

  const fixture = {
    session: SESSION,
    companyId,
    missions: [
      {
        id: buyerMission.id,
        name: buyerMission.name,
        templateKey: 'buyer-hunter',
        pipeline: buyerPipeline,
      },
      {
        id: supplyMission.id,
        name: supplyMission.name,
        templateKey: 'supply-hunter',
        pipeline: supplyPipeline,
      },
      {
        id: brandMission.id,
        name: brandMission.name,
        templateKey: 'brand-monitoring',
        pipeline: brandPipeline,
      },
    ],
    runs: [
      {
        id: buyerRun.id,
        missionId: buyerMission.id,
        pipelineHash: `dh-buyer-${SESSION}`,
        pipeline: buyerPipeline,
      },
      {
        id: supplyRun.id,
        missionId: supplyMission.id,
        pipelineHash: `dh-supply-${SESSION}`,
        pipeline: supplyPipeline,
      },
      {
        id: brandRun.id,
        missionId: brandMission.id,
        pipelineHash: `dh-brand-${SESSION}`,
        pipeline: brandPipeline,
      },
    ],
  };

  const runtimeDir = path.join(process.cwd(), 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const fixturePath = path.join(runtimeDir, `dual-host-fixture-${SESSION}.json`);
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));

  // Upload fixture + upsert script to VPS
  const remoteFixture = `/tmp/dual-host-fixture-${SESSION}.json`;
  const remoteScript = `/tmp/vps-upsert-verify-missions.ts`;
  execSync(
    `scp "${fixturePath}" ${VPS_USER}@${VPS_HOST}:${remoteFixture}`,
    { stdio: 'inherit' },
  );
  execSync(
    `scp "${path.join(process.cwd(), 'scripts/vps-upsert-verify-missions.ts')}" ${VPS_USER}@${VPS_HOST}:${remoteScript}`,
    { stdio: 'inherit' },
  );
  const upsertOut = execSync(
    `ssh -o BatchMode=yes ${VPS_USER}@${VPS_HOST} "sed -i 's/\\r$//' ${remoteScript}; cp ${remoteScript} ${VPS_DIR}/scripts/vps-upsert-verify-missions.ts; cd ${VPS_DIR} && npx tsx scripts/vps-upsert-verify-missions.ts ${remoteFixture}"`,
    { encoding: 'utf8' },
  );
  console.log('✓ Remote missions upserted', upsertOut.trim());

  async function runCase(input: {
    caseName: string;
    missionId: string;
    runId: string;
    pipeline: typeof buyerPipeline;
    pipelineHash: string;
    contentText: string;
    suffix: string;
    expectFinding: boolean;
    expectInventory: boolean;
  }): Promise<CaseResult> {
    const idem = `dh-${SESSION}-${input.suffix}`;
    const envelope = buildEnvelope({
      idempotencyKey: idem,
      missionId: input.missionId,
      missionRunId: input.runId,
      pipeline: input.pipeline,
      pipelineHash: input.pipelineHash,
      contentText: input.contentText,
      contentSuffix: input.suffix,
    });

    const post1 = await postEnvelopeToVps(envelope, settings);
    // Retry same idempotency
    const post2 = await postEnvelopeToVps(envelope, settings);

    // Query VPS counts via remote script using externalId
    const externalId = `verify_${SESSION}_${input.suffix}`;
    const queryJs = `
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const content = await p.scannedContent.findFirst({ where: { externalId: ${JSON.stringify(externalId)} } });
const findings = content ? await p.agentFinding.count({ where: { scannedContentId: content.id } }) : 0;
const inv = content ? await p.externalInventoryItem.count({ where: { scannedContentId: content.id } }) : 0;
const finding = content ? await p.agentFinding.findFirst({ where: { scannedContentId: content.id }, select: { id: true, missionId: true, missionRunId: true, classification: true } }) : null;
const invItem = content ? await p.externalInventoryItem.findFirst({ where: { scannedContentId: content.id }, select: { id: true } }) : null;
const steps = await p.agentWorkflowStepRun.count({ where: { missionRunId: ${JSON.stringify(input.runId)} } });
const run = await p.agentMissionRun.findUnique({ where: { id: ${JSON.stringify(input.runId)} }, select: { id: true, status: true } });
console.log(JSON.stringify({ contentId: content?.id ?? null, findings, inv, finding, invItem, steps, run }));
await p.$disconnect();
`;
    // Write query to temp file to avoid quoting hell
    const qPath = path.join(runtimeDir, `q-${input.suffix}-${SESSION}.mjs`);
    // Use tsx file instead
    const qTs = path.join(runtimeDir, `q-${input.suffix}-${SESSION}.ts`);
    fs.writeFileSync(
      qTs,
      `import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const content = await p.scannedContent.findFirst({ where: { externalId: ${JSON.stringify(externalId)} } });
  const findings = content ? await p.agentFinding.count({ where: { scannedContentId: content.id } }) : 0;
  const inv = content ? await p.externalInventoryItem.count({ where: { scannedContentId: content.id } }) : 0;
  const finding = content
    ? await p.agentFinding.findFirst({
        where: { scannedContentId: content.id },
        select: { id: true, missionId: true, missionRunId: true, classification: true },
      })
    : null;
  const invItem = content
    ? await p.externalInventoryItem.findFirst({
        where: { scannedContentId: content.id },
        select: { id: true },
      })
    : null;
  const steps = await p.agentWorkflowStepRun.count({ where: { missionRunId: ${JSON.stringify(input.runId)} } });
  const run = await p.agentMissionRun.findUnique({
    where: { id: ${JSON.stringify(input.runId)} },
    select: { id: true, status: true },
  });
  console.log(JSON.stringify({ contentId: content?.id ?? null, findings, inv, finding, invItem, steps, run }));
}
main().finally(() => p.$disconnect());
`,
    );
    const remoteQ = `/tmp/q-${input.suffix}-${SESSION}.ts`;
    execSync(`scp "${qTs}" ${VPS_USER}@${VPS_HOST}:${remoteQ}`, { stdio: 'pipe' });
    const qOut = execSync(
      `ssh -o BatchMode=yes ${VPS_USER}@${VPS_HOST} "cp ${remoteQ} ${VPS_DIR}/scripts/_q_tmp.ts; cd ${VPS_DIR} && npx tsx scripts/_q_tmp.ts"`,
      { encoding: 'utf8' },
    );
    const remote = JSON.parse(qOut.trim().split('\n').pop() || '{}') as {
      contentId: string | null;
      findings: number;
      inv: number;
      finding: { id: string; missionId: string | null; missionRunId: string | null } | null;
      invItem: { id: string } | null;
      steps: number;
      run: { id: string; status: string } | null;
    };

    const findingOk = input.expectFinding
      ? remote.findings >= 1 && Boolean(remote.finding?.missionRunId)
      : remote.findings === 0;
    const invOk = input.expectInventory ? remote.inv >= 1 : remote.inv === 0;
    const workflowOk = remote.steps > 0 || (post1.warnings || []).some(w => w.includes('mission_workflow'));
    const retryDup =
      post2.status === 'duplicate' ||
      (post2.scannedContentId != null && post2.scannedContentId === post1.scannedContentId);

    const pass = Boolean(post1.ok && findingOk && invOk && workflowOk && retryDup);
    const result: CaseResult = {
      case: input.caseName,
      localMissionId: input.missionId,
      localRunId: input.runId,
      remoteContentId: remote.contentId || post1.scannedContentId || null,
      remoteFindingId: remote.finding?.id || post1.findingId || null,
      remoteInventoryId: remote.invItem?.id || null,
      findingCount: remote.findings,
      inventoryCount: remote.inv,
      stepCount: remote.steps,
      warnings: post1.warnings || [],
      retryDuplicate: Boolean(retryDup),
      status: pass ? 'PASS' : 'FAIL',
      error: pass
        ? undefined
        : JSON.stringify({
            post1,
            post2Status: post2.status,
            remote,
            findingOk,
            invOk,
            workflowOk,
          }),
    };
    console.log(
      result.status === 'PASS' ? `✓ ${input.caseName}` : `✗ ${input.caseName}`,
      JSON.stringify({
        findingCount: result.findingCount,
        inventoryCount: result.inventoryCount,
        steps: result.stepCount,
        findingId: result.remoteFindingId,
        inventoryId: result.remoteInventoryId,
        retryDuplicate: result.retryDuplicate,
      }),
    );
    return result;
  }

  results.push(
    await runCase({
      caseName: 'Buyer Hunter Dual Host',
      missionId: buyerMission.id,
      runId: buyerRun.id,
      pipeline: buyerPipeline,
      pipelineHash: `dh-buyer-${SESSION}`,
      contentText:
        'Tài chính 4 tỷ cần tìm nhà tại Thanh Khê, ô tô vào được, liên hệ 0901234567 gấp trong tháng này',
      suffix: 'buyer',
      expectFinding: true,
      expectInventory: false,
    }),
  );

  results.push(
    await runCase({
      caseName: 'Supply Hunter Dual Host',
      missionId: supplyMission.id,
      runId: supplyRun.id,
      pipeline: supplyPipeline,
      pipelineHash: `dh-supply-${SESSION}`,
      contentText:
        'Bán lô đất 100m², giá hơn 3 tỷ, hướng Đông Nam, hotline 0912345678 chính chủ sổ đỏ',
      suffix: 'supply',
      expectFinding: false,
      expectInventory: true,
    }),
  );

  results.push(
    await runCase({
      caseName: 'Brand Monitor Dual Host',
      missionId: brandMission.id,
      runId: brandRun.id,
      pipeline: brandPipeline,
      pipelineHash: `dh-brand-${SESSION}`,
      contentText:
        'Thảo luận về thương hiệu ABC Real Estate hôm nay nhiều người khen dịch vụ tư vấn tốt tại Đà Nẵng',
      suffix: 'brand',
      expectFinding: false,
      expectInventory: false,
    }),
  );

  const report = {
    session: SESSION,
    deployedCommitHint: 'local HEAD deployed via archive',
    health: {
      tenant: (health.data as { tenant?: string })?.tenant,
      missionProvenance: prov,
    },
    missions: {
      buyer: buyerMission.id,
      supply: supplyMission.id,
      brand: brandMission.id,
    },
    runs: {
      buyer: buyerRun.id,
      supply: supplyRun.id,
      brand: brandRun.id,
    },
    results,
    allPass: results.every(r => r.status === 'PASS'),
  };

  const outPath = path.join(runtimeDir, `dual-host-report-${SESSION}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);

  await prisma.$disconnect();
  process.exit(report.allPass ? 0 : 1);
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
