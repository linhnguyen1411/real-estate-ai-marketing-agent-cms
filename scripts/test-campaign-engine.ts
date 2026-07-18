#!/usr/bin/env tsx
/**
 * Campaign Engine — pure + Prisma multi-destination tests.
 * npm run test:campaign-engine
 */
import assert from 'node:assert/strict';
import { prisma } from '../server/prisma';
import {
  buildCampaignExecutionPlan,
  buildCampaignProgress,
  classifyCampaignRunStatus,
  createCampaign,
  mapPublishJobToTargetStatus,
  startCampaignRun,
  refreshCampaignRunProgress,
} from '../server/modules/social-publishing/campaignService';
import { fingerprintBody } from '../server/modules/social-publishing/safetyService';

let passed = 0;
function ok(name: string) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name: string, err: unknown) {
  console.error(`  ✗ ${name}`);
  console.error(err);
  process.exitCode = 1;
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

console.log('Campaign Engine — tests\n');

await test('1. mapPublishJobToTargetStatus', () => {
  assert.equal(mapPublishJobToTargetStatus('published'), 'published');
  assert.equal(mapPublishJobToTargetStatus('failed'), 'failed');
  assert.equal(mapPublishJobToTargetStatus('publishing'), 'publishing');
  assert.equal(mapPublishJobToTargetStatus('queued'), 'queued');
});

await test('2. progress + classify completed', () => {
  const p = buildCampaignProgress([
    { status: 'published' },
    { status: 'published' },
  ]);
  assert.equal(p.completed, 2);
  assert.equal(classifyCampaignRunStatus(p), 'completed');
});

await test('3. classify partial_success', () => {
  const p = buildCampaignProgress([
    { status: 'published' },
    { status: 'failed' },
    { status: 'published' },
  ]);
  assert.equal(classifyCampaignRunStatus(p), 'partial_success');
});

await test('4. classify failed / running', () => {
  assert.equal(
    classifyCampaignRunStatus(buildCampaignProgress([{ status: 'failed' }, { status: 'failed' }])),
    'failed',
  );
  assert.equal(
    classifyCampaignRunStatus(
      buildCampaignProgress([{ status: 'published' }, { status: 'queued' }]),
    ),
    'running',
  );
});

await test('5. buildCampaignExecutionPlan dedupes channels', () => {
  const plan = buildCampaignExecutionPlan({
    campaignId: 'c1',
    draftId: 'd1',
    channelIds: ['ch_a', 'ch_a', 'ch_b'],
    destinationKeys: ['facebook_timeline', null, 'facebook_group'],
    scheduledAt: new Date('2026-07-17T00:00:00.000Z'),
  });
  assert.equal(plan.targets.length, 2);
  assert.equal(plan.targets[0].channelId, 'ch_a');
  assert.equal(plan.targets[1].channelId, 'ch_b');
});

await test('6. multi-destination campaign creates N publish jobs', async () => {
  const suffix = `camp_${Date.now()}`;
  const companyId = `co_${suffix}`;

  const draftHashes = fingerprintBody(`Campaign body ${suffix}`);
  const draft = await prisma.socialPostDraft.create({
    data: {
      companyId,
      body: `Campaign body ${suffix}`,
      status: 'approved',
      bodyHash: draftHashes.bodyHash,
      normalizedBodyHash: draftHashes.normalizedBodyHash,
    },
  });

  const timeline = await prisma.socialChannel.create({
    data: {
      companyId,
      type: 'facebook_profile',
      name: `Timeline ${suffix}`,
      executionMode: 'browser',
      status: 'active',
      isActive: true,
      config: {},
    },
  });
  const groupA = await prisma.socialChannel.create({
    data: {
      companyId,
      type: 'facebook_group',
      name: `Group A ${suffix}`,
      executionMode: 'browser',
      status: 'active',
      isActive: true,
      profileUrl: 'https://www.facebook.com/groups/111/',
      config: { groupUrl: 'https://www.facebook.com/groups/111/' },
    },
  });
  const groupB = await prisma.socialChannel.create({
    data: {
      companyId,
      type: 'facebook_group',
      name: `Group B ${suffix}`,
      executionMode: 'browser',
      status: 'active',
      isActive: true,
      profileUrl: 'https://www.facebook.com/groups/222/',
      config: { groupUrl: 'https://www.facebook.com/groups/222/' },
    },
  });

  const campaign = await createCampaign({
    companyId,
    name: `Multi dest ${suffix}`,
    draftId: draft.id,
    channelIds: [timeline.id, groupA.id, groupB.id],
    createdBy: 'test-campaign',
  });

  assert.equal(campaign.status, 'active');

  // Do not enqueue AgentJobs (no worker needed) — create jobs only
  const started = await startCampaignRun({
    campaignId: campaign.id,
    triggeredBy: 'test-campaign',
    enqueueNow: false,
  });

  assert.equal(started.plan.targets.length, 3);
  assert.equal(started.targets.length, 3);
  assert.ok(started.targets.every(t => t.publishJobId));

  const jobIds = started.targets.map(t => t.publishJobId!).filter(Boolean);
  assert.equal(new Set(jobIds).size, 3);

  const jobs = await prisma.socialPublishJob.findMany({ where: { id: { in: jobIds } } });
  assert.equal(jobs.length, 3);
  assert.ok(jobs.every(j => j.draftId === draft.id));
  assert.deepEqual(
    new Set(jobs.map(j => j.channelId)),
    new Set([timeline.id, groupA.id, groupB.id]),
  );

  // Simulate mixed outcomes → partial_success
  await prisma.socialPublishJob.update({
    where: { id: jobIds[0] },
    data: {
      status: 'published',
      result: { publishedUrl: 'https://www.facebook.com/me/posts/1', missionRunId: 'mr_1' },
    },
  });
  await prisma.socialPublishJob.update({
    where: { id: jobIds[1] },
    data: {
      status: 'published',
      result: {
        publishedUrl: 'https://www.facebook.com/groups/111/posts/2',
        missionRunId: 'mr_2',
      },
    },
  });
  await prisma.socialPublishJob.update({
    where: { id: jobIds[2] },
    data: { status: 'failed', errorCode: 'browser_publish_failed', errorMessage: 'boom' },
  });

  const refreshed = await refreshCampaignRunProgress(started.run.id);
  assert.equal(refreshed.progress.completed, 2);
  assert.equal(refreshed.progress.failed, 1);
  assert.equal(refreshed.run.status, 'partial_success');
  assert.ok(refreshed.targets.some(t => t.permalink?.includes('/posts/')));
  assert.ok(refreshed.targets.some(t => t.status === 'failed'));

  // destination keys resolved
  const keys = started.targets.map(t => t.destinationKey).sort();
  assert.ok(keys.includes('facebook_timeline'));
  assert.ok(keys.filter(k => k === 'facebook_group').length >= 1);
});

if (!process.exitCode) {
  console.log(`\n${passed} tests passed`);
}

await prisma.$disconnect();
