/**
 * Browser Action mission steps — Action Framework via Destination registry.
 * Never calls Playwright / Browser Runtime directly.
 *
 * Mission → Execution Agent → Action → Destination → Evidence
 */

import type { WorkflowStepHandler } from './stepContract';
import type { WorkflowStepContext, WorkflowStepResult } from '../domain/workflowTypes';
import {
  resolveDestinationAdapter,
  isDestinationKey,
} from '../../social-publishing/browser/destinationRegistry';
import type { DestinationKey } from '../../social-publishing/browser/types';
import type { AutomationActionKey } from '../../social-publishing/browser/actions/types';
import { AUTOMATION_ACTION_KEYS } from '../../social-publishing/browser/actions/types';
import type { BrowserDestinationContext } from '../../social-publishing/browser/types';
import type { GenericBrowserDestinationAdapter } from '../../social-publishing/browser/adapters/genericBrowserDestinationAdapter';

function completed(output: Record<string, unknown>): WorkflowStepResult {
  return { status: 'completed', output };
}

function isActionKey(value: string): value is AutomationActionKey {
  return (AUTOMATION_ACTION_KEYS as readonly string[]).includes(value);
}

function resolveDestinationKey(ctx: WorkflowStepContext): DestinationKey {
  const fromStep = ctx.step.config?.destinationKey;
  if (typeof fromStep === 'string' && isDestinationKey(fromStep)) return fromStep;
  if (typeof ctx.destinationKey === 'string' && isDestinationKey(ctx.destinationKey)) {
    return ctx.destinationKey;
  }
  const fromPrev = ctx.previousStepOutputs.destinationKey;
  if (typeof fromPrev === 'string' && isDestinationKey(fromPrev)) return fromPrev;
  return 'facebook_timeline';
}

function resolveActionKey(ctx: WorkflowStepContext): AutomationActionKey {
  const raw =
    (typeof ctx.step.config?.action === 'string' && ctx.step.config.action) ||
    (typeof ctx.step.config?.actionKey === 'string' && ctx.step.config.actionKey) ||
    '';
  if (!isActionKey(raw) || raw === 'publish') {
    throw new Error(
      `browser_action step requires config.action in: ${AUTOMATION_ACTION_KEYS.filter(k => k !== 'publish').join(', ')}`,
    );
  }
  return raw;
}

function buildActionContext(ctx: WorkflowStepContext): BrowserDestinationContext {
  const cfg = { ...(ctx.step.config || {}) };
  const prevCfg =
    ctx.previousStepOutputs.destinationConfig &&
    typeof ctx.previousStepOutputs.destinationConfig === 'object'
      ? (ctx.previousStepOutputs.destinationConfig as Record<string, unknown>)
      : {};

  const publishJobId =
    (typeof ctx.publishJobId === 'string' && ctx.publishJobId.trim()) ||
    (typeof ctx.jobId === 'string' && ctx.jobId.trim()) ||
    `action_${ctx.missionRunId}_${ctx.step.id}`;

  const dryRun =
    cfg.dryRun === false
      ? false
      : cfg.dryRun === true
        ? true
        : process.env.BROWSER_PUBLISH_LIVE !== '1';

  const body =
    (typeof cfg.actionText === 'string' && cfg.actionText) ||
    (typeof cfg.text === 'string' && cfg.text) ||
    (typeof prevCfg.actionText === 'string' && (prevCfg.actionText as string)) ||
    '';

  return {
    publishJobId,
    draftId: typeof cfg.draftId === 'string' ? cfg.draftId : `draft_${publishJobId}`,
    destinationId:
      typeof cfg.destinationId === 'string' ? cfg.destinationId : `dest_${resolveDestinationKey(ctx)}`,
    missionRunId: ctx.missionRunId,
    workerId:
      typeof ctx.previousStepOutputs.workerId === 'string'
        ? ctx.previousStepOutputs.workerId
        : null,
    browserSessionId:
      typeof ctx.previousStepOutputs.browserSessionId === 'string'
        ? ctx.previousStepOutputs.browserSessionId
        : null,
    body,
    linkUrl: typeof cfg.linkUrl === 'string' ? cfg.linkUrl : null,
    media: [],
    destinationConfig: {
      ...prevCfg,
      ...cfg,
      // Preserve approval flags from previous AI-suggest / human-approve steps
      humanApproved:
        cfg.humanApproved === true ||
        prevCfg.humanApproved === true ||
        ctx.previousStepOutputs.humanApproved === true,
      actionApproved:
        cfg.actionApproved === true ||
        prevCfg.actionApproved === true ||
        ctx.previousStepOutputs.actionApproved === true,
      approvedBy:
        (typeof cfg.approvedBy === 'string' && cfg.approvedBy) ||
        (typeof prevCfg.approvedBy === 'string' && prevCfg.approvedBy) ||
        (typeof ctx.previousStepOutputs.approvedBy === 'string'
          ? ctx.previousStepOutputs.approvedBy
          : undefined),
    },
    dryRun,
  };
}

function asActionHost(adapter: unknown): GenericBrowserDestinationAdapter {
  const host = adapter as GenericBrowserDestinationAdapter;
  if (typeof host.getAction !== 'function') {
    throw new Error('Destination adapter does not expose Action Framework getAction()');
  }
  return host;
}

/**
 * Single mission step: full Action lifecycle
 * prepare → execute → verify → captureEvidence → cleanup
 */
export const browserActionStep: WorkflowStepHandler = {
  type: 'browser_action',
  async execute(ctx) {
    const actionKey = resolveActionKey(ctx);
    const destinationKey = resolveDestinationKey(ctx);
    const adapter = asActionHost(resolveDestinationAdapter(destinationKey));
    const action = adapter.getAction(actionKey);
    if (!action) {
      throw new Error(`Action not bound on destination ${destinationKey}: ${actionKey}`);
    }

    const actionCtx = buildActionContext(ctx);

    const prepare = await action.prepare(actionCtx);
    const execute = await action.execute(actionCtx);
    const verify = await action.verify(actionCtx);
    const evidence = await action.captureEvidence(actionCtx);
    const cleanup = await action.cleanup(actionCtx);

    const ok = prepare.ok && execute.ok && verify.ok && cleanup.ok;
    return completed({
      ok,
      action: actionKey,
      destinationKey,
      dryRun: actionCtx.dryRun,
      prepare,
      execute,
      verify,
      evidence,
      cleanup,
      requiresHumanApproval: execute.message === 'human_approval_required',
      autoExecute: false,
    });
  },
};

/** AI suggestion step — never executes browser actions. */
export const browserSuggestActionStep: WorkflowStepHandler = {
  type: 'browser_suggest_action',
  async execute(ctx) {
    const { suggestBrowserAction } = await import(
      '../../social-publishing/browser/actions/actionSuggestions'
    );
    const intentRaw =
      (typeof ctx.step.config?.action === 'string' && ctx.step.config.action) ||
      (typeof ctx.step.config?.intent === 'string' && ctx.step.config.intent) ||
      'comment';
    if (!isActionKey(intentRaw) || intentRaw === 'publish') {
      throw new Error(`browser_suggest_action invalid intent: ${intentRaw}`);
    }

    const suggestion = suggestBrowserAction({
      intent: intentRaw,
      topic: typeof ctx.step.config?.topic === 'string' ? ctx.step.config.topic : undefined,
      draftText:
        typeof ctx.step.config?.draftText === 'string'
          ? ctx.step.config.draftText
          : typeof ctx.step.config?.text === 'string'
            ? ctx.step.config.text
            : undefined,
      reaction: typeof ctx.step.config?.reaction === 'string' ? ctx.step.config.reaction : undefined,
      targetUrl:
        typeof ctx.step.config?.targetUrl === 'string' ? ctx.step.config.targetUrl : undefined,
    });

    return completed({
      suggestion,
      requiresHumanApproval: true,
      autoExecute: false,
      // Explicitly do NOT mark approved — human must approve before browser_action
      humanApproved: false,
    });
  },
};

export const BROWSER_ACTION_STEP_HANDLERS: WorkflowStepHandler[] = [
  browserActionStep,
  browserSuggestActionStep,
];
