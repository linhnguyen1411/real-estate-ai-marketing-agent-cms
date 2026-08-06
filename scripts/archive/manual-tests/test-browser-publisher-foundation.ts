/**
 * Architecture / unit tests — Browser Publisher Foundation (Phase A+B).
 * No Playwright, no E2E.
 *
 * Run: npm run test:browser-publisher-foundation
 */

import assert from 'node:assert/strict';

let passed = 0;
let skipped = 0;

function ok(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    throw new Error(`FAIL: ${name}`);
  }
}

async function main() {
  // ── Destination registry ─────────────────────────────────────
  const {
    listDestinationRegistrations,
    resolveDestinationAdapter,
    resolveDestinationKeyFromChannel,
    isDestinationKey,
    _resetDestinationRegistryForTests,
  } = await import('../server/modules/social-publishing/browser/destinationRegistry');

  _resetDestinationRegistryForTests();
  const regs = listDestinationRegistrations();
  ok('registry lists 3 destinations', regs.length === 3);
  ok(
    'registry has facebook_timeline',
    regs.some(r => r.key === 'facebook_timeline'),
  );
  ok('registry has facebook_group', regs.some(r => r.key === 'facebook_group'));
  ok(
    'registry has facebook_page_web',
    regs.some(r => r.key === 'facebook_page_web'),
  );

  const timelineAdapter = resolveDestinationAdapter('facebook_timeline');
  ok('resolve adapter by key', timelineAdapter.key === 'facebook_timeline');

  ok(
    'channel map profile → timeline',
    resolveDestinationKeyFromChannel({ type: 'facebook_profile', executionMode: 'browser' }) ===
      'facebook_timeline',
  );
  ok(
    'channel map group',
    resolveDestinationKeyFromChannel({ type: 'facebook_group', executionMode: 'browser' }) ===
      'facebook_group',
  );
  ok(
    'channel map page web',
    resolveDestinationKeyFromChannel({ type: 'facebook_page', executionMode: 'browser' }) ===
      'facebook_page_web',
  );
  ok('isDestinationKey valid', isDestinationKey('facebook_timeline'));
  ok('isDestinationKey rejects unknown', !isDestinationKey('twitter'));

  const stubResult = await timelineAdapter.prepare({
    publishJobId: 'job1',
    draftId: 'd1',
    destinationId: 'c1',
    missionRunId: 'mr1',
    body: 'hello',
    linkUrl: null,
    media: [],
    destinationConfig: {},
    dryRun: true,
  });
  ok('stub prepare dryRun', stubResult.ok === true && (stubResult.dryRun === true || stubResult.data?.dryRun === true));

  const groupAdapter = resolveDestinationAdapter('facebook_group');
  ok('group adapter is live (not stub message)', !String((await groupAdapter.prepare({
    publishJobId: 'job_g',
    draftId: 'd_g',
    destinationId: 'c_g',
    missionRunId: 'mr_g',
    body: 'g',
    linkUrl: null,
    media: [],
    destinationConfig: { groupUrl: 'https://www.facebook.com/groups/1/' },
    dryRun: true,
  })).message || '').includes('stub:'));

  // ── Capability registry ──────────────────────────────────────
  const {
    getCapabilitiesForDestination,
    assertCapability,
    DESTINATION_CAPABILITY_PRESETS,
  } = await import('../server/modules/social-publishing/browser/capabilities');

  const caps = getCapabilitiesForDestination('facebook_timeline');
  ok('capabilities supportsText', caps.supportsText === true);
  ok('capabilities no video MVP', caps.supportsVideo === false);
  ok(
    'preset registry complete',
    Object.keys(DESTINATION_CAPABILITY_PRESETS).length === 3,
  );
  ok('assertCapability text ok', assertCapability(caps, 'supportsText').ok === true);
  ok(
    'assertCapability video fail',
    assertCapability(caps, 'supportsVideo').ok === false,
  );

  // ── Mission publish workflow registration ────────────────────
  const { workflowStepHandlers } = await import('../server/modules/mission-engine/steps');
  const {
    PUBLISH_BROWSER_CONTENT_PIPELINE,
    PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY,
    isBrowserPublishPipeline,
    BROWSER_PUBLISH_STEP_TYPES,
  } = await import('../server/modules/mission-engine/domain/publishMissionTemplate');
  const { MISSION_WORKFLOW_TEMPLATES } = await import(
    '../server/modules/mission-engine/domain/missionTemplates'
  );
  const { validateWorkflowPipeline } = await import(
    '../server/modules/mission-engine/domain/workflowValidation'
  );

  ok(
    'template registered',
    MISSION_WORKFLOW_TEMPLATES.some(t => t.id === PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY),
  );
  ok('pipeline is browser publish', isBrowserPublishPipeline(PUBLISH_BROWSER_CONTENT_PIPELINE));
  ok('pipeline has 8 steps', PUBLISH_BROWSER_CONTENT_PIPELINE.steps.length === 8);

  const validation = validateWorkflowPipeline(PUBLISH_BROWSER_CONTENT_PIPELINE);
  ok('pipeline validates', validation.ok === true);

  for (const stepType of BROWSER_PUBLISH_STEP_TYPES) {
    ok(`handler registered: ${stepType}`, workflowStepHandlers.has(stepType));
  }

  // ── Evidence service ───────────────────────────────────────────
  const {
    hashDomContent,
    buildEvidencePaths,
    createStubEvidenceBundle,
    writePublishEvidenceManifest,
    readPublishEvidenceManifest,
  } = await import('../server/modules/social-publishing/runtime/publishEvidenceService');

  const hash1 = hashDomContent('Hello   world');
  const hash2 = hashDomContent('Hello world');
  ok('dom hash normalizes whitespace', hash1 === hash2);

  const paths = buildEvidencePaths('job_test', 'attempt_test');
  ok('evidence paths under runtime', paths.baseDir.includes('publish-evidence'));

  const bundle = createStubEvidenceBundle({
    publishJobId: 'job_test',
    missionRunId: 'mr_test',
    workerId: 'worker-1',
    destinationKey: 'facebook_timeline',
    durationMs: 42,
  });
  ok('stub evidence bundle', Boolean(bundle.publishJobId === 'job_test' && bundle.domHash));

  const written = await writePublishEvidenceManifest('attempt_test', bundle);
  const readBack = await readPublishEvidenceManifest('job_test', 'attempt_test');
  ok('evidence manifest roundtrip', readBack?.missionRunId === written.missionRunId);

  // ── Graph publisher not default ──────────────────────────────
  const { resetPublisherRegistry, resolvePublisher } = await import(
    '../server/modules/social-publishing/publishers/registry'
  );
  const prev = process.env.SOCIAL_ALLOW_GRAPH_PUBLISH;
  delete process.env.SOCIAL_ALLOW_GRAPH_PUBLISH;
  resetPublisherRegistry();
  try {
    resolvePublisher({
      id: 'c',
      type: 'facebook_page',
      executionMode: 'graph_api',
      name: 'x',
      companyId: null,
      externalId: null,
      profileUrl: null,
      status: 'active',
      browserSessionId: null,
      config: {},
      isActive: true,
      consecutiveFailures: 0,
      lastVerifiedAt: null,
      lastVerifyError: null,
      tokenExpiresAt: null,
      connectionState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as import('@prisma/client').SocialChannel);
    ok('graph default disabled', false);
  } catch (e) {
    ok(
      'graph default disabled throws',
      e instanceof Error && e.message.includes('No publisher'),
    );
  } finally {
    if (prev !== undefined) process.env.SOCIAL_ALLOW_GRAPH_PUBLISH = prev;
    resetPublisherRegistry();
  }

  // ── Bridge + workflow (DB optional) ──────────────────────────
  try {
    const { startPublishMissionRun } = await import(
      '../server/modules/social-publishing/publishMissionBridge'
    );
    const { executePublishWorkflow } = await import(
      '../server/modules/mission-engine/application/publishWorkflowExecutionService'
    );
    ok('bridge exported', typeof startPublishMissionRun === 'function');
    ok('executePublishWorkflow exported', typeof executePublishWorkflow === 'function');
  } catch (e) {
    skipped += 1;
    console.log(`⊘ bridge import skipped: ${e instanceof Error ? e.message : e}`);
  }

  console.log(`\nPassed: ${passed}, Skipped: ${skipped}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
