/**
 * Mission 2.0 fixture smoke — Buyer + Brand + Seller gate + legacy note.
 * Does NOT create production-looking mass data; uses isolated synthetic source/content.
 *
 * npm run test:mission-engine already covers domain.
 * This script: npx tsx scripts/smoke-mission-pipelines.ts
 */
import crypto from 'crypto';
import { prisma } from '../server/prisma';
import { assertValidPipeline } from '../server/modules/mission-engine/domain/workflowValidation';
import { createMissionRun, completeMissionRunIfSettled } from '../server/modules/mission-engine/repositories/missionRunRepository';
import { executeContentWorkflow } from '../server/modules/mission-engine/application/workflowExecutionService';
import { processFindingForContent } from '../server/agent-worker/services/findingRuleEngine';

const TAG = `m2smoke_${Date.now()}`;

function hash(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function main() {
  const companyId = 'comp-da-nang';

  const source = await prisma.agentSource.create({
    data: {
      companyId,
      name: `[SMOKE] Mission2 ${TAG}`,
      type: 'website',
      url: `https://example.invalid/mission2-smoke/${TAG}`,
      status: 'paused',
      priority: 99,
      scanIntervalMinutes: 1440,
      config: { smoke: true, maxPages: 1 },
    },
  });

  const buyerPipeline = assertValidPipeline({
    version: 1,
    steps: [
      { id: 'spam', type: 'spam_filter', enabled: true, executionTarget: 'either' },
      {
        id: 'extract',
        type: 'extract_structured_data',
        enabled: true,
        dependsOn: ['spam'],
        executionTarget: 'vps',
      },
      {
        id: 'classify',
        type: 'classify_subject',
        enabled: true,
        dependsOn: ['extract'],
        executionTarget: 'vps',
        config: {
          allowedClassifications: ['buyer', 'renter', 'investor'],
          allowedActors: ['demand_side'],
        },
      },
      {
        id: 'finding',
        type: 'create_lead_intelligence',
        enabled: true,
        dependsOn: ['classify'],
        executionTarget: 'vps',
      },
      {
        id: 'notify_cms',
        type: 'notify_cms',
        enabled: true,
        dependsOn: ['finding'],
        executionTarget: 'vps',
        config: { minimumScore: 99 },
        retry: { onFailure: 'continue' },
      },
    ],
  });

  const brandPipeline = assertValidPipeline({
    version: 1,
    steps: [
      { id: 'spam', type: 'spam_filter', enabled: true, executionTarget: 'either' },
      {
        id: 'topic',
        type: 'topic_match',
        enabled: true,
        dependsOn: ['spam'],
        executionTarget: 'vps',
      },
      {
        id: 'summary',
        type: 'summarize',
        enabled: true,
        dependsOn: ['topic'],
        executionTarget: 'vps',
      },
      {
        id: 'notify_cms',
        type: 'notify_cms',
        enabled: true,
        dependsOn: ['summary'],
        executionTarget: 'vps',
        config: { mode: 'summary' },
        retry: { onFailure: 'continue' },
      },
    ],
  });

  const buyerMission = await prisma.agentMission.create({
    data: {
      companyId,
      name: `[SMOKE] Buyer ${TAG}`,
      objective: 'Buyer pipeline smoke',
      status: 'active',
      templateKey: 'buyer-hunter',
      pipeline: buyerPipeline as object,
      pipelineVersion: 1,
      rules: {
        sourceIds: [source.id],
        templateId: 'buyer-hunter',
        minScore: 40,
        notifyScore: 99,
        targetClassifications: ['buyer', 'renter', 'investor'],
      },
    },
  });

  const brandMission = await prisma.agentMission.create({
    data: {
      companyId,
      name: `[SMOKE] Brand ${TAG}`,
      objective: 'Brand monitoring — no Finding',
      status: 'active',
      templateKey: 'brand-monitoring',
      pipeline: brandPipeline as object,
      pipelineVersion: 1,
      rules: { sourceIds: [source.id], templateId: 'brand-monitoring' },
    },
  });

  await prisma.agentMissionSource.createMany({
    data: [
      { companyId, missionId: buyerMission.id, sourceId: source.id, isActive: true },
      { companyId, missionId: brandMission.id, sourceId: source.id, isActive: true },
    ],
  });

  const buyerText =
    'Cần mua đất nền Nam Đà Nẵng khu Hòa Xuân ngân sách 3 tỷ liên hệ 0901234567 gấp trong tháng này';
  const sellerText =
    'Chính chủ bán đất nền Hòa Xuân DT 100m2 giá 2.8 tỷ sổ đỏ sẵn lh 0912345678';
  const brandText =
    'Thảo luận về thương hiệu ABC Real Estate hôm nay nhiều người khen dịch vụ tư vấn tốt tại Đà Nẵng';

  const mkContent = async (text: string, suffix: string) => {
    const contentHash = hash(`${TAG}:${suffix}:${text}`);
    return prisma.scannedContent.create({
      data: {
        companyId,
        sourceId: source.id,
        externalId: `${TAG}_${suffix}`,
        canonicalUrl: `https://example.invalid/posts/${TAG}/${suffix}`,
        authorName: `Smoke Author ${suffix}`,
        contentText: text,
        contentHash,
        status: 'collected',
        rawData: { smoke: true, tag: TAG },
      },
    });
  };

  const buyerContent = await mkContent(buyerText, 'buyer');
  const sellerContent = await mkContent(sellerText, 'seller');
  const brandContent = await mkContent(brandText, 'brand');

  const buyerRun = await createMissionRun({
    companyId,
    missionId: buyerMission.id,
    missionVersion: 1,
    pipelineSnapshot: buyerPipeline,
    pipelineHash: 'smoke-buyer',
    triggerType: 'manual',
    triggeredBy: 'smoke-mission-pipelines',
    status: 'running',
  });

  const brandRun = await createMissionRun({
    companyId,
    missionId: brandMission.id,
    missionVersion: 1,
    pipelineSnapshot: brandPipeline,
    pipelineHash: 'smoke-brand',
    triggerType: 'manual',
    triggeredBy: 'smoke-mission-pipelines',
    status: 'running',
  });

  const buyerWf = await executeContentWorkflow({
    missionRunId: buyerRun.id,
    scannedContentId: buyerContent.id,
    sourceId: source.id,
    missionRules: buyerMission.rules as Record<string, unknown>,
  });
  const sellerWf = await executeContentWorkflow({
    missionRunId: buyerRun.id,
    scannedContentId: sellerContent.id,
    sourceId: source.id,
    missionRules: buyerMission.rules as Record<string, unknown>,
  });
  const brandWf = await executeContentWorkflow({
    missionRunId: brandRun.id,
    scannedContentId: brandContent.id,
    sourceId: source.id,
    missionRules: brandMission.rules as Record<string, unknown>,
  });

  // Idempotent retry buyer
  const buyerRetry = await executeContentWorkflow({
    missionRunId: buyerRun.id,
    scannedContentId: buyerContent.id,
    sourceId: source.id,
  });

  // Legacy source-run path (no MissionRun): processFindingForContent directly
  const legacyContent = await mkContent(
    'Cần thuê căn hộ 2PN gần sông Hàn ngân sách 12 triệu/tháng 0987654321',
    'legacy',
  );
  const legacyFinding = await processFindingForContent({
    content: legacyContent,
    source,
    mission: null,
    title: 'Cần thuê căn hộ',
  });

  await completeMissionRunIfSettled(buyerRun.id);
  await completeMissionRunIfSettled(brandRun.id);

  const buyerFinding = await prisma.agentFinding.findFirst({
    where: { scannedContentId: buyerContent.id },
  });
  const sellerFinding = await prisma.agentFinding.findFirst({
    where: { scannedContentId: sellerContent.id },
  });
  const brandFindingCount = await prisma.agentFinding.count({
    where: { scannedContentId: brandContent.id },
  });
  const brandInventory = await prisma.externalInventoryItem.count({
    where: { scannedContentId: brandContent.id },
  });
  const brandSteps = await prisma.agentWorkflowStepRun.findMany({
    where: { missionRunId: brandRun.id, scannedContentId: brandContent.id },
    orderBy: { createdAt: 'asc' },
    select: { stepId: true, stepType: true, status: true, findingId: true },
  });
  const buyerSteps = await prisma.agentWorkflowStepRun.findMany({
    where: { missionRunId: buyerRun.id, scannedContentId: buyerContent.id },
    orderBy: { createdAt: 'asc' },
    select: { stepId: true, stepType: true, status: true, findingId: true },
  });
  const buyerStepCountBeforeRetry = buyerSteps.length;
  const buyerStepCountAfter = await prisma.agentWorkflowStepRun.count({
    where: { missionRunId: buyerRun.id, scannedContentId: buyerContent.id },
  });

  const buyerRunFinal = await prisma.agentMissionRun.findUnique({ where: { id: buyerRun.id } });
  const brandRunFinal = await prisma.agentMissionRun.findUnique({ where: { id: brandRun.id } });

  const report = {
    tag: TAG,
    sourceId: source.id,
    buyer: {
      missionId: buyerMission.id,
      missionRunId: buyerRun.id,
      runStatus: buyerRunFinal?.status,
      workflow: buyerWf,
      sellerWorkflow: sellerWf,
      retry: buyerRetry,
      steps: buyerSteps,
      findingId: buyerFinding?.id ?? null,
      findingClassification: buyerFinding?.classification ?? null,
      sellerFindingId: sellerFinding?.id ?? null,
      stepCountStable: buyerStepCountBeforeRetry === buyerStepCountAfter,
    },
    brand: {
      missionId: brandMission.id,
      missionRunId: brandRun.id,
      runStatus: brandRunFinal?.status,
      workflow: brandWf,
      steps: brandSteps,
      findingCount: brandFindingCount,
      inventoryCount: brandInventory,
      hasCreateLeadStep: brandSteps.some(s => s.stepType === 'create_lead_intelligence'),
    },
    legacy: {
      contentId: legacyContent.id,
      findingCreated: legacyFinding.findingCreated,
      findingScore: legacyFinding.score,
      filterStage: legacyFinding.filterStage,
    },
    gates: {
      buyerCreatedFinding: Boolean(buyerFinding?.id),
      sellerNoFindingOrSkipped: !sellerFinding,
      brandNoFinding: brandFindingCount === 0,
      brandNoInventory: brandInventory === 0,
      brandNoLeadStep: !brandSteps.some(s => s.stepType === 'create_lead_intelligence'),
      retryIdempotent: buyerStepCountBeforeRetry === buyerStepCountAfter,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const failedGates = Object.entries(report.gates).filter(([, v]) => !v);
  if (failedGates.length) {
    console.error('SMOKE GATES FAILED:', failedGates.map(([k]) => k).join(', '));
    process.exitCode = 1;
  } else {
    console.log('SMOKE GATES PASS');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
