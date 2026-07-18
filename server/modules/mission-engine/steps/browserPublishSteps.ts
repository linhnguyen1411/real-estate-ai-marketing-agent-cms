/**
 * Browser publish workflow step handlers — foundation stubs (no Playwright/DOM).
 * Delegates to BrowserDestinationAdapter via registry.
 */

import type { WorkflowStepHandler } from './stepContract';
import type { WorkflowStepContext, WorkflowStepResult } from '../domain/workflowTypes';
import {
  loadPublishWorkflowPayload,
  resolveAdapterForPayload,
  toBrowserDestinationContext,
  type PublishWorkflowPayload,
} from '../../social-publishing/publishWorkflowContext';
import {
  createStubEvidenceBundle,
  writePublishEvidenceManifest,
} from '../../social-publishing/runtime/publishEvidenceService';

const PUBLISH_CTX_KEY = '__publish__';

async function requirePublishPayload(ctx: WorkflowStepContext): Promise<PublishWorkflowPayload> {
  const cached = ctx.previousStepOutputs[PUBLISH_CTX_KEY] as PublishWorkflowPayload | undefined;
  if (cached?.publishJobId) return cached;

  const publishJobId = String(ctx.publishJobId || '').trim();
  if (!publishJobId) {
    throw new Error('browser publish step missing publishJobId');
  }
  return loadPublishWorkflowPayload(publishJobId);
}

function browserCtx(ctx: WorkflowStepContext, payload: PublishWorkflowPayload) {
  return toBrowserDestinationContext(payload, {
    missionRunId: ctx.missionRunId,
    workerId: typeof ctx.previousStepOutputs.workerId === 'string'
      ? ctx.previousStepOutputs.workerId
      : null,
    browserSessionId:
      typeof ctx.previousStepOutputs.browserSessionId === 'string'
        ? ctx.previousStepOutputs.browserSessionId
        : null,
  });
}

function completed(output: Record<string, unknown>): WorkflowStepResult {
  return { status: 'completed', output };
}

export const browserPrepareStep: WorkflowStepHandler = {
  type: 'browser_prepare',
  async execute(ctx) {
    const payload = await requirePublishPayload(ctx);
    const adapter = resolveAdapterForPayload(payload);
    const result = await adapter.prepare(browserCtx(ctx, payload));
    return completed({
      ...result,
      destinationKey: payload.destinationKey,
      dryRun: payload.dryRun,
      [PUBLISH_CTX_KEY]: payload,
    });
  },
};

export const browserNavigateStep: WorkflowStepHandler = {
  type: 'browser_navigate',
  async execute(ctx) {
    const payload = await requirePublishPayload(ctx);
    const adapter = resolveAdapterForPayload(payload);
    const auth = await adapter.ensureAuthenticated(browserCtx(ctx, payload));
    const nav = await adapter.navigate(browserCtx(ctx, payload));
    return completed({ auth, navigate: nav, destinationKey: payload.destinationKey });
  },
};

export const browserUploadMediaStep: WorkflowStepHandler = {
  type: 'browser_upload_media',
  async execute(ctx) {
    const payload = await requirePublishPayload(ctx);
    const adapter = resolveAdapterForPayload(payload);
    const result = await adapter.uploadMedia(browserCtx(ctx, payload));
    return completed({ upload: result, mediaCount: payload.media.length });
  },
};

export const browserFillContentStep: WorkflowStepHandler = {
  type: 'browser_fill_content',
  async execute(ctx) {
    const payload = await requirePublishPayload(ctx);
    const adapter = resolveAdapterForPayload(payload);
    const result = await adapter.fillContent(browserCtx(ctx, payload));
    return completed({ fill: result, bodyLength: payload.body.length });
  },
};

export const browserPublishStep: WorkflowStepHandler = {
  type: 'browser_publish',
  async execute(ctx) {
    const payload = await requirePublishPayload(ctx);
    const adapter = resolveAdapterForPayload(payload);
    const result = await adapter.publish(browserCtx(ctx, payload));
    return completed({ publish: result });
  },
};

export const browserVerifyPublishStep: WorkflowStepHandler = {
  type: 'browser_verify_publish',
  async execute(ctx) {
    const payload = await requirePublishPayload(ctx);
    const adapter = resolveAdapterForPayload(payload);
    const result = await adapter.verify(browserCtx(ctx, payload));
    return completed({ verify: result });
  },
};

export const browserCaptureEvidenceStep: WorkflowStepHandler = {
  type: 'browser_capture_evidence',
  async execute(ctx) {
    const payload = await requirePublishPayload(ctx);
    const adapter = resolveAdapterForPayload(payload);
    const started = Date.now();
    const captured = await adapter.captureEvidence(browserCtx(ctx, payload));
    const durationMs = captured.durationMs ?? Date.now() - started;

    const attemptId = `wf_${ctx.missionRunId}_${ctx.step.id}`;
    const bundle = createStubEvidenceBundle({
      publishJobId: payload.publishJobId,
      missionRunId: ctx.missionRunId,
      workerId: typeof ctx.previousStepOutputs.workerId === 'string'
        ? ctx.previousStepOutputs.workerId
        : null,
      destinationKey: payload.destinationKey,
      durationMs,
    });
    bundle.publishedUrl = captured.publishedUrl ?? null;
    bundle.domHash = captured.domHash ?? bundle.domHash;
    bundle.screenshotBeforePath = captured.screenshotBeforePath ?? null;
    bundle.screenshotAfterPath = captured.screenshotAfterPath ?? null;
    bundle.htmlSnapshotPath = captured.htmlSnapshotPath ?? null;

    const manifest = await writePublishEvidenceManifest(attemptId, bundle);
    return completed({ evidence: manifest, capture: captured });
  },
};

export const browserCleanupStep: WorkflowStepHandler = {
  type: 'browser_cleanup',
  async execute(ctx) {
    const payload = await requirePublishPayload(ctx);
    const adapter = resolveAdapterForPayload(payload);
    const result = await adapter.cleanup(browserCtx(ctx, payload));
    return completed({ cleanup: result, publishJobId: payload.publishJobId });
  },
};

export const BROWSER_PUBLISH_STEP_HANDLERS: WorkflowStepHandler[] = [
  browserPrepareStep,
  browserNavigateStep,
  browserUploadMediaStep,
  browserFillContentStep,
  browserPublishStep,
  browserVerifyPublishStep,
  browserCaptureEvidenceStep,
  browserCleanupStep,
];
