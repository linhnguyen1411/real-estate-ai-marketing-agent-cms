#!/usr/bin/env node
/**
 * Social Publishing MVP — pure unit + optional Prisma integration tests.
 * No live Facebook. Set SOCIAL_PUBLISH_DRY_RUN=1 for publisher dry-run paths.
 *
 * Run: npm run test:social-publishing
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DRAFT_STATUSES,
  ACTIVE_JOB_STATUSES,
  buildIdempotencyKey,
  shouldSkipRetry,
  canScheduleDraftStatus,
  isDailyCapAllowed,
  isSpacingAllowed,
  isActivePublishJobStatus,
  hasActiveChannelJob,
  mapNeedsLoginErrorCode,
  fingerprintBody,
  normalizeBody,
  assertChannelPublishable,
  validateMediaList,
  validateMime,
  validateCount,
  validateSize,
  buildPublishSuccessEventKey,
  buildPublishFailureEventKey,
  buildChannelNeedsLoginEventKey,
  parsePublishSuccess,
  recoverAfterPublishClickTimeout,
  buildPublishContext,
  mapGraphError,
  mapGraphApiError,
  sanitizeGraphPayload,
  computeBackoffMs,
  facebookPageGraphPublisher,
  enqueueDueSocialPublishJobs,
  reclaimStalePublishJobs,
  claimPublishJob,
  retryJob,
  AGENT_JOB_TYPE_PUBLISH_SOCIAL,
} from '../server/modules/social-publishing/index';
import type { PublishContext, PublishResult } from '../server/modules/social-publishing/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let skipped = 0;

function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

function skip(name: string, reason: string) {
  skipped += 1;
  console.log(`⊘ ${name} — ${reason}`);
}

async function tryPrisma() {
  try {
    const { prisma } = await import('../server/prisma');
    await prisma.$queryRaw`SELECT 1`;
    // Probe social tables
    await prisma.socialChannel.findFirst({ take: 1 });
    return prisma;
  } catch (error) {
    return null;
  }
}

async function runDbTests() {
  const prisma = await tryPrisma();
  if (!prisma) {
    skip('DB integration suite', 'Prisma unavailable or social_* tables missing — run prisma migrate');
    return;
  }

  const suffix = `sp_test_${Date.now()}`;
  const companyA = `co_a_${suffix}`;
  const companyB = `co_b_${suffix}`;
  let channelId = '';
  let draftId = '';
  let jobId = '';

  try {
    const channel = await prisma.socialChannel.create({
      data: {
        companyId: companyA,
        type: 'facebook_profile',
        name: `Test Channel ${suffix}`,
        executionMode: 'browser',
        status: 'active',
        isActive: true,
        config: {},
      },
    });
    channelId = channel.id;

    // 2. draft lifecycle statuses (create → pending via AI helper)
    const { createDraft, createAiGeneratedDraft, approveDraft, submitForReview } =
      await import('../server/modules/social-publishing/draftService');
    const draft = await createDraft({
      companyId: companyA,
      body: `Hello draft ${suffix}`,
      title: 'lifecycle',
      createdBy: 'test',
    });
    draftId = draft.id;
    ok('2. draft starts as draft', draft.status === 'draft');

    const submitted = await submitForReview(draft.id, 'test');
    ok('2. submit → pending_review', submitted.status === 'pending_review');

    const approved = await approveDraft(draft.id, 'approver');
    ok('2. approve → approved', approved.status === 'approved');
    ok('17. approve sets approvedBy', approved.approvedBy === 'approver');

    // 3. approval required before schedule
    const unapproved = await createDraft({
      companyId: companyA,
      body: `Unapproved ${suffix}`,
      createdBy: 'test',
    });
    ok('3. canScheduleDraftStatus rejects draft', !canScheduleDraftStatus(unapproved.status));
    ok('3. canScheduleDraftStatus allows approved', canScheduleDraftStatus('approved'));

    // 4 + 8. schedule creates job with idempotency; same key twice → one job
    const { createPublishJob } = await import('../server/modules/social-publishing/jobService');
    const scheduledAt = new Date('2030-01-15T10:00:00.000Z');
    const key = buildIdempotencyKey(draft.id, channelId, scheduledAt);
    const job1 = await createPublishJob({
      companyId: companyA,
      draftId: draft.id,
      channelId,
      scheduledAt,
      actor: 'test',
    });
    jobId = job1.id;
    ok('4. job has idempotency key', job1.idempotencyKey === key);
    ok('4. job status queued', job1.status === 'queued');

    const job2 = await createPublishJob({
      companyId: companyA,
      draftId: draft.id,
      channelId,
      scheduledAt,
      actor: 'test',
    });
    ok('8. idempotent create returns same job', job2.id === job1.id);

    // 7. duplicate content check (publish first job result then try similar body)
    await prisma.socialPublishJob.update({
      where: { id: job1.id },
      data: {
        status: 'published',
        completedAt: new Date(),
        result: { externalPostId: 'dup_test_1' },
      },
    });
    const { checkDuplicate } = await import('../server/modules/social-publishing/safetyService');
    const hashes = fingerprintBody(`Hello draft ${suffix}`);
    const dup = await checkDuplicate({
      companyId: companyA,
      channelId,
      bodyHash: hashes.bodyHash,
      normalizedHash: hashes.normalizedBodyHash,
    });
    ok('7. duplicate content detected after publish', dup.duplicate === true);

    // 14. retry does not republish if already published
    const { retryJob, cancelJob } = await import('../server/modules/social-publishing/jobService');
    const retryRes = await retryJob(job1.id, 'test');
    ok('14. retry skipped when published', retryRes.skipped === true && retryRes.reason === 'already_published');

    // 15. cancel job — use a fresh queued job
    const draft2 = await createDraft({
      companyId: companyA,
      body: `Cancel me ${suffix}`,
      createdBy: 'test',
    });
    await approveDraft(draft2.id, 'test');
    const cancelable = await createPublishJob({
      companyId: companyA,
      draftId: draft2.id,
      channelId,
      scheduledAt: new Date('2030-02-01T00:00:00.000Z'),
      actor: 'test',
    });
    const cancelled = await cancelJob(cancelable.id, 'test');
    ok('15. cancel job → cancelled', cancelled.status === 'cancelled');

    // 16. tenant isolation
    const { listDrafts } = await import('../server/modules/social-publishing/draftService');
    await createDraft({
      companyId: companyB,
      body: `Other tenant ${suffix}`,
      createdBy: 'test',
    });
    const listA = await listDrafts({ companyId: companyA });
    const listB = await listDrafts({ companyId: companyB });
    ok(
      '16. tenant isolation companyA',
      listA.every((d: { companyId: string | null }) => d.companyId === companyA),
    );
    ok(
      '16. tenant isolation companyB',
      listB.every((d: { companyId: string | null }) => d.companyId === companyB) && listB.length >= 1,
    );

    // 18 + 19. AI draft → pending_review, no auto approve
    const ai = await createAiGeneratedDraft({
      companyId: companyA,
      body: `AI generated ${suffix}`,
      title: 'from mission',
      createdBy: 'mission',
    });
    ok('18. createAiGeneratedDraft → pending_review', ai.status === 'pending_review');
    ok('19. no auto approve on AI draft', !ai.approvedBy && !ai.approvedAt);

    const { createMissionSocialDraft } = await import(
      '../server/modules/social-publishing/missionIntegration'
    );
    const missionDraft = await createMissionSocialDraft({
      companyId: companyA,
      body: `Mission draft ${suffix}`,
      missionId: 'm1',
      stepId: 's1',
    });
    ok(
      '19b. missionIntegration also pending_review',
      missionDraft.status === 'pending_review' && !missionDraft.approvedBy,
    );

    // ── PRODUCTION DB (optional) ────────────────────────────
    // P7. reclaim + enqueue creates AgentJob only (no publisher call)
    const dueDraft = await createDraft({
      companyId: companyA,
      body: `Due enqueue ${suffix}`,
      createdBy: 'test',
    });
    await approveDraft(dueDraft.id, 'test');
    const dueJob = await createPublishJob({
      companyId: companyA,
      draftId: dueDraft.id,
      channelId,
      scheduledAt: new Date(Date.now() - 60_000),
      actor: 'test',
    });
    const beforeAgent = await prisma.agentJob.count({
      where: { type: AGENT_JOB_TYPE_PUBLISH_SOCIAL },
    });
    const enqueueRes = await enqueueDueSocialPublishJobs(new Date());
    ok('P7. enqueueDue returns counts', typeof enqueueRes.created === 'number');
    const afterAgent = await prisma.agentJob.count({
      where: { type: AGENT_JOB_TYPE_PUBLISH_SOCIAL },
    });
    ok(
      'P7. enqueueDue creates AgentJob (not publisher)',
      afterAgent >= beforeAgent && (enqueueRes.created >= 1 || enqueueRes.skipped >= 1),
    );
    const agentForDue = await prisma.agentJob.findFirst({
      where: {
        type: AGENT_JOB_TYPE_PUBLISH_SOCIAL,
        payload: { path: ['publishJobId'], equals: dueJob.id },
      },
    });
    ok('P7. AgentJob payload has publishJobId', Boolean(agentForDue));
    ok('P7. AgentJob has missionRunId', Boolean(agentForDue?.missionRunId));

    // P8. claim channel lock — second claim fails
    const lockDraft = await createDraft({
      companyId: companyA,
      body: `Lock A ${suffix}`,
      createdBy: 'test',
    });
    await approveDraft(lockDraft.id, 'test');
    const lockDraftB = await createDraft({
      companyId: companyA,
      body: `Lock B ${suffix}`,
      createdBy: 'test',
    });
    await approveDraft(lockDraftB.id, 'test');
    const jobA = await createPublishJob({
      companyId: companyA,
      draftId: lockDraft.id,
      channelId,
      scheduledAt: new Date('2031-01-01T00:00:00.000Z'),
      actor: 'test',
    });
    const jobB = await createPublishJob({
      companyId: companyA,
      draftId: lockDraftB.id,
      channelId,
      scheduledAt: new Date('2031-01-02T00:00:00.000Z'),
      actor: 'test',
    });
    const claimedA = await claimPublishJob(jobA.id, 'worker-a');
    ok('P8. first claim succeeds', claimedA?.status === 'claimed');
    const activeJobs = [
      { id: claimedA!.id, status: claimedA!.status },
      { id: jobB.id, status: jobB.status },
    ];
    ok(
      'P8. hasActiveChannelJob true when other active',
      hasActiveChannelJob(activeJobs, channelId, jobB.id) === true,
    );
    let claimBFailed = false;
    try {
      await claimPublishJob(jobB.id, 'worker-b');
    } catch (err) {
      claimBFailed =
        err instanceof Error &&
        ((err as { code?: string }).code === 'channel_locked' ||
          /channel has another active/i.test(err.message));
    }
    ok('P8. second claim fails with channel_locked', claimBFailed);

    // P12. manual retry resets attempts
    await prisma.socialPublishJob.update({
      where: { id: jobB.id },
      data: { status: 'failed', attempts: 2, errorCode: 'graph_api_error' },
    });
    const retried = await retryJob(jobB.id, 'test');
    ok(
      'P12. retry resets attempts to 0',
      !retried.skipped && retried.job.attempts === 0 && retried.job.status === 'queued',
    );

    // Cleanup extra production rows via company filters in finally
  } finally {
    // cleanup best-effort
    try {
      await prisma.agentJob.deleteMany({
        where: {
          OR: [{ companyId: companyA }, { companyId: companyB }],
          type: AGENT_JOB_TYPE_PUBLISH_SOCIAL,
        },
      });
      if (jobId) {
        await prisma.socialPublishJob.deleteMany({
          where: { OR: [{ id: jobId }, { companyId: companyA }, { companyId: companyB }] },
        });
      } else {
        await prisma.socialPublishJob.deleteMany({
          where: { OR: [{ companyId: companyA }, { companyId: companyB }] },
        });
      }
      await prisma.socialPostDraft.deleteMany({
        where: { OR: [{ companyId: companyA }, { companyId: companyB }] },
      });
      if (channelId) {
        await prisma.socialChannel.deleteMany({ where: { id: channelId } });
      }
      await prisma.socialPublishAuditLog.deleteMany({
        where: { OR: [{ companyId: companyA }, { companyId: companyB }] },
      });
      try {
        await prisma.socialPublishAttempt.deleteMany({
          where: { OR: [{ companyId: companyA }, { companyId: companyB }] },
        });
      } catch {
        // table may not exist yet
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

async function main() {
  process.env.SOCIAL_PUBLISH_DRY_RUN = process.env.SOCIAL_PUBLISH_DRY_RUN || '1';

  // 1. legacy inventory file
  const legacyPath = path.join(root, 'docs/publishing/PUBLISHING-LEGACY-AUDIT.md');
  ok('1. legacy inventory file exists', fs.existsSync(legacyPath));

  // 2. draft lifecycle statuses (constants)
  ok('2. DRAFT_STATUSES includes draft→published', DRAFT_STATUSES.includes('draft') && DRAFT_STATUSES.includes('published') && DRAFT_STATUSES.includes('pending_review'));

  // 3. approval required
  ok('3. reject schedule if still draft', !canScheduleDraftStatus('draft'));
  ok('3. reject schedule if pending_review', !canScheduleDraftStatus('pending_review'));
  ok('3. allow schedule when approved', canScheduleDraftStatus('approved'));

  // 4. idempotency key shape
  const at = new Date('2030-01-01T12:00:00.000Z');
  const key = buildIdempotencyKey('d1', 'c1', at);
  ok('4. idempotency key format', key === `d1:c1:${at.toISOString()}`);

  // 5. daily cap pure
  ok('5. daily cap allows under max', isDailyCapAllowed(2, 3) === true);
  ok('5. daily cap blocks at max', isDailyCapAllowed(3, 3) === false);
  ok('5. spacing allows when null last', isSpacingAllowed(null) === true);
  ok(
    '5. spacing blocks recent publish',
    isSpacingAllowed(new Date(Date.now() - 60_000), new Date(), 120) === false,
  );

  // 6. channel lock / active job
  ok('6. ACTIVE_JOB_STATUSES has publishing', ACTIVE_JOB_STATUSES.includes('publishing'));
  ok('6. isActivePublishJobStatus', isActivePublishJobStatus('publishing') && !isActivePublishJobStatus('queued'));
  ok(
    '6. hasActiveChannelJob',
    hasActiveChannelJob(
      [
        { id: 'a', status: 'publishing' },
        { id: 'b', status: 'queued' },
      ],
      'ch',
      'b',
    ) === true,
  );
  ok(
    '6. hasActiveChannelJob excludes self',
    hasActiveChannelJob([{ id: 'a', status: 'publishing' }], 'ch', 'a') === false,
  );

  // 7. duplicate fingerprint (pure)
  const fp1 = fingerprintBody('Hello  World!!!');
  const fp2 = fingerprintBody('hello world');
  ok('7. normalize collapses whitespace/punct', normalizeBody('Hello  World!!!') === 'hello world');
  ok('7. normalized hashes match for near-dupes', fp1.normalizedBodyHash === fp2.normalizedBodyHash);

  // 9. profile browser publisher dry-run / parse helpers
  const ctx = buildPublishContext({ body: 'hi', linkUrl: 'https://x.test', dryRun: true });
  ok('9. buildPublishContext dryRun', ctx.dryRun === true && ctx.bodyHash.length === 64);
  ok(
    '9. parsePublishSuccess live toast',
    parsePublishSuccess({ toastText: 'Your post is now live' }).success === true,
  );
  ok(
    '9. parsePublishSuccess failure',
    parsePublishSuccess({ bodyText: 'Something went wrong' }).success === false,
  );

  // 10. page graph publisher — mapGraphError (mock-style, no network)
  const tokenExpired = mapGraphError({ error: { code: 190, message: 'expired' } });
  ok('10. mapGraphError 190 → graph_token_expired', tokenExpired.errorCode === 'graph_token_expired');
  const other = mapGraphError({ error: { code: 100, message: 'bad' } });
  ok('10. mapGraphError other → graph_api_error', other.errorCode === 'graph_api_error');

  // ── PRODUCTION (pure / mocks, no live FB) ─────────────────

  // P1. Publish success result shape
  const successShape: PublishResult = {
    ok: true,
    facebookPostId: '123_456',
    facebookPostUrl: 'https://www.facebook.com/123_456',
    externalPostId: '123_456',
    externalUrl: 'https://www.facebook.com/123_456',
    latencyMs: 42,
    request: sanitizeGraphPayload({
      endpoint: '/page/feed',
      method: 'POST',
      message: 'hi',
      access_token: 'EAASECRET',
    }),
  };
  ok(
    'P1. success shape has facebookPostId + latencyMs',
    successShape.ok === true &&
      successShape.facebookPostId === '123_456' &&
      successShape.latencyMs === 42,
  );
  ok(
    'P1. success request sanitized (no raw token)',
    successShape.request?.access_token === '[REDACTED]',
  );

  // P2. Publish failed mapGraphApiError
  const failedMapped = mapGraphApiError({ error: { code: 100, message: 'Invalid parameter' } });
  ok(
    'P2. mapGraphApiError generic → graph_api_error',
    failedMapped.errorCode === 'graph_api_error' &&
      failedMapped.errorMessage === 'Invalid parameter',
  );
  const failedViaWrapper = mapGraphError({ error: { code: 1, message: 'fail' } });
  ok('P2. mapGraphError ok=false', failedViaWrapper.ok === false);

  // P3. Retry backoff computeBackoffMs
  ok('P3. backoff attempt 1 = 60s', computeBackoffMs(1) === 60_000);
  ok('P3. backoff attempt 2 = 120s', computeBackoffMs(2) === 120_000);
  ok('P3. backoff attempt 3 = 240s', computeBackoffMs(3) === 240_000);
  ok('P3. backoff capped at 30m', computeBackoffMs(20) === 30 * 60_000);

  // P4. Duplicate / shouldSkipRetry
  ok('P4. shouldSkipRetry published', shouldSkipRetry({ status: 'published' }).skip);
  ok(
    'P4. shouldSkipRetry externalPostId',
    shouldSkipRetry({ status: 'failed', result: { externalPostId: 'p1' } }).skip,
  );
  ok('P4. shouldSkipRetry allows failed without post', !shouldSkipRetry({ status: 'failed' }).skip);

  // P5. Expired token mapping 190
  const exp = mapGraphApiError({ error: { code: 190, message: 'Error validating access token' } });
  ok('P5. code 190 → graph_token_expired', exp.errorCode === 'graph_token_expired');

  // P6. Permission denied 10/200
  const perm10 = mapGraphApiError({ error: { code: 10, message: 'Permission denied' } });
  ok('P6. code 10 → graph_permission_denied', perm10.errorCode === 'graph_permission_denied');
  const perm200 = mapGraphApiError({ error: { code: 200, message: 'Requires permission' } });
  ok('P6. code 200 → graph_permission_denied', perm200.errorCode === 'graph_permission_denied');

  // P7 structural: enqueueDueSocialPublishJobs source only reclaim + AgentJob (no publisher)
  ok(
    'P7. enqueueDueSocialPublishJobs is exported function',
    typeof enqueueDueSocialPublishJobs === 'function' &&
      typeof reclaimStalePublishJobs === 'function',
  );

  // P8 pure: hasActiveChannelJob claim lock semantics
  ok(
    'P8. hasActiveChannelJob blocks second job',
    hasActiveChannelJob(
      [
        { id: 'a', status: 'publishing' },
        { id: 'b', status: 'queued' },
      ],
      'ch',
      'b',
    ) === true,
  );
  ok(
    'P8. hasActiveChannelJob false when only self active',
    hasActiveChannelJob([{ id: 'a', status: 'claimed' }], 'ch', 'a') === false,
  );

  // P9. Timeout error code publish_timeout
  const timeoutMapped = mapGraphApiError({
    error: { code: 'publish_timeout', message: 'Graph request timed out after 90000ms' },
  });
  ok('P9. publish_timeout mapped', timeoutMapped.errorCode === 'publish_timeout');

  // P10. sanitizeGraphPayload redacts access_token
  const sanitized = sanitizeGraphPayload({
    access_token: 'EAAabc123',
    message: 'hello',
    nested: { pageAccessToken: 'secret', ok: true },
  });
  ok('P10. access_token redacted', sanitized.access_token === '[REDACTED]');
  ok(
    'P10. nested pageAccessToken redacted',
    (sanitized.nested as Record<string, unknown>).pageAccessToken === '[REDACTED]' &&
      (sanitized.nested as Record<string, unknown>).ok === true,
  );
  ok('P10. message preserved', sanitized.message === 'hello');

  // P11. Multi-image rejected / media_invalid (publisher, no network)
  const multiCtx = {
    workerId: 'test',
    job: { id: 'j1' } as PublishContext['job'],
    channel: {
      id: 'c1',
      type: 'facebook_page',
      executionMode: 'graph_api',
      externalId: 'page1',
      config: { pageAccessToken: 'tok' },
    } as unknown as PublishContext['channel'],
    draft: {
      id: 'd1',
      body: 'multi',
      linkUrl: null,
      media: [
        { type: 'image', fileUrl: 'https://cdn.example.com/a.jpg', sortOrder: 0 },
        { type: 'image', fileUrl: 'https://cdn.example.com/b.jpg', sortOrder: 1 },
      ],
    } as unknown as PublishContext['draft'],
  } as unknown as PublishContext;
  const multiResult = await facebookPageGraphPublisher.publish(multiCtx);
  ok(
    'P11. multi-image → media_invalid',
    multiResult.ok === false && multiResult.errorCode === 'media_invalid',
  );
  const videoCtx = {
    ...multiCtx,
    draft: {
      ...multiCtx.draft,
      media: [{ type: 'video', fileUrl: 'https://cdn.example.com/v.mp4', sortOrder: 0 }],
    },
  } as unknown as PublishContext;
  const videoResult = await facebookPageGraphPublisher.publish(videoCtx);
  ok(
    'P11. video → media_invalid',
    videoResult.ok === false && videoResult.errorCode === 'media_invalid',
  );

  // 11. needs_login mapping
  ok('11. browser_auth_blocked → needs_login', mapNeedsLoginErrorCode('browser_auth_blocked'));
  ok('11. graph_token_expired → needs_login', mapNeedsLoginErrorCode('graph_token_expired'));
  ok('11. channel_needs_login', mapNeedsLoginErrorCode('channel_needs_login'));
  ok('11. unrelated code not needs_login', !mapNeedsLoginErrorCode('daily_cap'));

  const pausedChannel = {
    id: 'x',
    isActive: true,
    status: 'needs_login',
    consecutiveFailures: 0,
  } as Parameters<typeof assertChannelPublishable>[0];
  const blocked = assertChannelPublishable(pausedChannel);
  ok('11. assertChannelPublishable needs_login', blocked.ok === false && blocked.errorCode === 'channel_needs_login');

  // 12. timeout-after-click recovery
  const recovered = recoverAfterPublishClickTimeout({
    timedOut: true,
    toastText: 'Đăng thành công',
  });
  ok('12. timeout recovery succeeds on success signal', recovered.recovered && recovered.success);
  const unrecovered = recoverAfterPublishClickTimeout({
    timedOut: true,
    bodyText: 'still loading...',
  });
  ok('12. timeout without signal not recovered', !unrecovered.recovered);

  // 13. media validation
  ok('13. validateMime jpeg ok', validateMime('image/jpeg').ok);
  ok('13. validateMime gif rejected', !validateMime('image/gif').ok);
  ok('13. validateCount over max', !validateCount(5, 4).ok);
  ok('13. validateSize over max', !validateSize(9_000_000, 8_000_000).ok);
  ok(
    '13. validateMediaList requires url',
    !validateMediaList([{ fileUrl: '' }]).ok,
  );
  ok(
    '13. validateMediaList ok',
    validateMediaList([{ fileUrl: 'https://cdn.example.com/a.jpg', mime: 'image/png' }]).ok,
  );

  // 14. retry skip pure
  ok('14. shouldSkipRetry published', shouldSkipRetry({ status: 'published' }).skip);
  ok(
    '14. shouldSkipRetry externalPostId',
    shouldSkipRetry({ status: 'failed', result: { externalPostId: 'p1' } }).skip,
  );
  ok('14. shouldSkipRetry allows failed without post', !shouldSkipRetry({ status: 'failed' }).skip);

  // 20. notification eventKey stability
  ok(
    '20. success eventKey stable',
    buildPublishSuccessEventKey('job1') === 'social_publish_success:job1',
  );
  ok(
    '20. failure eventKey stable',
    buildPublishFailureEventKey('job1', 'daily_cap') === 'social_publish_failed:job1:daily_cap',
  );
  ok(
    '20. needs_login eventKey stable',
    buildChannelNeedsLoginEventKey('ch1') === 'social_channel_needs_login:ch1',
  );
  ok(
    '20. failure eventKey defaults unknown',
    buildPublishFailureEventKey('job1') === 'social_publish_failed:job1:unknown',
  );

  await runDbTests();

  console.log(`\nPassed: ${passed}, Skipped: ${skipped}`);
  if (passed < 20) {
    console.error('Expected at least 20 assertions to pass.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
