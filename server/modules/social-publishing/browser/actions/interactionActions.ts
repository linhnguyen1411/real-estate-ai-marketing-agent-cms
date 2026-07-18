/**
 * Browser interaction actions (comment / reply / react / …).
 * Orchestrate lifecycle only — Destination supplies selectors + DOM ops.
 * PublishAction remains separate and unchanged.
 */

import type { Page } from 'playwright';
import {
  buildEvidencePaths,
  writePublishEvidenceManifest,
} from '../../runtime/publishEvidenceService';
import { assertBrowserActionApproved } from './actionApproval';
import {
  clickFirstMatching,
  fillFirstMatching,
  hoverFirstMatching,
} from './domInteractionOps';
import type { DestinationActionHost } from './destinationActionHost';
import type {
  AutomationAction,
  AutomationActionContext,
  AutomationActionEvidence,
  AutomationActionKey,
  AutomationActionResult,
} from './types';

type InteractionKey = Exclude<AutomationActionKey, 'publish'>;

function actionText(ctx: AutomationActionContext): string {
  const cfg = ctx.destinationConfig || {};
  if (typeof cfg.actionText === 'string' && cfg.actionText.trim()) return cfg.actionText.trim();
  if (typeof cfg.text === 'string' && cfg.text.trim()) return cfg.text.trim();
  if (ctx.body?.trim()) return ctx.body.trim();
  return '';
}

function actionReaction(ctx: AutomationActionContext): string {
  const cfg = ctx.destinationConfig || {};
  if (typeof cfg.reaction === 'string' && cfg.reaction.trim()) return cfg.reaction.trim();
  return 'Like';
}

function actionTargetUrl(ctx: AutomationActionContext, host: DestinationActionHost): string {
  const cfg = ctx.destinationConfig || {};
  if (typeof cfg.targetUrl === 'string' && cfg.targetUrl.trim()) return cfg.targetUrl.trim();
  if (typeof cfg.profileUrl === 'string' && cfg.profileUrl.trim()) return cfg.profileUrl.trim();
  if (typeof cfg.groupUrl === 'string' && cfg.groupUrl.trim()) return cfg.groupUrl.trim();
  return host.initialUrl(ctx);
}

async function maybeGoto(
  host: DestinationActionHost,
  page: Page | null,
  ctx: AutomationActionContext,
): Promise<void> {
  if (!page || ctx.dryRun) return;
  const url = actionTargetUrl(ctx, host);
  if (!url) return;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
}

async function capturePhase(
  host: DestinationActionHost,
  ctx: AutomationActionContext,
  phase: 'before' | 'after',
): Promise<void> {
  if (typeof host.captureScreenshotPhase === 'function') {
    await host.captureScreenshotPhase(ctx, phase);
  }
}

abstract class BrowserInteractionAction implements AutomationAction {
  abstract readonly key: InteractionKey;
  abstract readonly label: string;

  constructor(protected readonly host: DestinationActionHost) {}

  async prepare(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    const prepared = await this.host.prepareHost(ctx);
    const state = this.host.stateFor(ctx);
    state.lastActionKey = this.key;
    state.lastActionResult = undefined;
    state.lastActionError = null;
    return prepared;
  }

  async execute(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    const approval = assertBrowserActionApproved(ctx);
    const state = this.host.stateFor(ctx);
    state.lastActionKey = this.key;

    if (approval.ok === false) {
      state.lastActionResult = 'awaiting_approval';
      state.lastActionError = approval.message;
      return {
        ok: false,
        phase: 'execute',
        message: approval.message,
        data: { action: this.key, requiresHumanApproval: true, autoExecute: false },
      };
    }

    const page = await this.host.ensurePage(ctx);
    await capturePhase(this.host, ctx, 'before');

    try {
      if (page && !ctx.dryRun) {
        await this.host.ensureAuthenticated(ctx);
        await maybeGoto(this.host, page, ctx);
      }

      const result = await this.runInteraction(page, ctx);
      if (result.ok) {
        state.lastActionResult = 'success';
        state.lastActionError = null;
        state.lastActionData = result.data;
      } else {
        state.lastActionResult = 'failed';
        state.lastActionError = result.message || 'action_failed';
      }
      await capturePhase(this.host, ctx, 'after');
      return result;
    } catch (error) {
      const mapped = this.host.mapError(error, this.key);
      state.lastActionResult = 'failed';
      state.lastActionError = mapped.message;
      await capturePhase(this.host, ctx, 'after');
      throw mapped;
    }
  }

  protected abstract runInteraction(
    page: Page | null,
    ctx: AutomationActionContext,
  ): Promise<AutomationActionResult>;

  async verify(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    const state = this.host.stateFor(ctx);
    if (state.lastActionResult === 'awaiting_approval') {
      return {
        ok: false,
        phase: 'verify',
        message: 'human_approval_required',
        data: { action: this.key },
      };
    }
    if (state.lastActionResult === 'success' || (ctx.dryRun && state.lastActionResult !== 'failed')) {
      if (ctx.dryRun && !state.lastActionResult) {
        state.lastActionResult = 'success';
      }
      return this.host.ok('verify', {
        action: this.key,
        result: state.lastActionResult || 'success',
        dryRun: ctx.dryRun,
      });
    }
    return {
      ok: false,
      phase: 'verify',
      message: state.lastActionError || 'verify_failed',
      data: { action: this.key, result: state.lastActionResult },
    };
  }

  async captureEvidence(ctx: AutomationActionContext): Promise<AutomationActionEvidence> {
    const state = this.host.stateFor(ctx);
    const captured = await this.host.captureBrowserEvidence(ctx);
    const attemptId = `wf_${ctx.missionRunId}_action_${this.key}`;
    const paths = buildEvidencePaths(ctx.publishJobId, attemptId);

    const result = state.lastActionResult || (ctx.dryRun ? 'success' : 'unknown');
    const error = state.lastActionError ?? null;

    await writePublishEvidenceManifest(attemptId, {
      publishJobId: ctx.publishJobId,
      missionRunId: ctx.missionRunId,
      workerId: ctx.workerId ?? null,
      browserSessionId: ctx.browserSessionId ?? null,
      destinationKey: this.host.key,
      durationMs: captured.durationMs ?? Math.max(0, Date.now() - state.startedAt),
      publishedUrl: captured.publishedUrl ?? null,
      domHash: captured.domHash ?? null,
      screenshotBeforePath: captured.screenshotBeforePath ?? paths.screenshotBeforePath,
      screenshotAfterPath: captured.screenshotAfterPath ?? paths.screenshotAfterPath,
      htmlSnapshotPath: captured.htmlSnapshotPath ?? paths.htmlSnapshotPath,
      capturedAt: new Date().toISOString(),
      actionKey: this.key,
      result,
      error,
    });

    return {
      ...captured,
      actionKey: this.key,
      result,
      error,
      durationMs: captured.durationMs ?? Math.max(0, Date.now() - state.startedAt),
    };
  }

  async cleanup(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    return this.host.cleanupHost(ctx);
  }

  protected dryOk(phase: string, data?: Record<string, unknown>): AutomationActionResult {
    return this.host.ok(phase, { dryRun: true, action: this.key, ...data });
  }
}

export class CommentAction extends BrowserInteractionAction {
  readonly key = 'comment' as const;
  readonly label = 'Comment';

  protected async runInteraction(
    page: Page | null,
    ctx: AutomationActionContext,
  ): Promise<AutomationActionResult> {
    const text = actionText(ctx);
    if (!text) {
      return { ok: false, phase: 'execute', message: 'comment_text_required', data: { action: this.key } };
    }
    if (!page || ctx.dryRun) {
      return this.dryOk('execute', { textLength: text.length });
    }
    const sel = this.host.getInteractionSelectors();
    const filled = await fillFirstMatching(page, sel.commentComposer, text);
    if (!filled.filled) {
      return { ok: false, phase: 'execute', message: 'comment_composer_not_found', data: { action: this.key } };
    }
    await clickFirstMatching(page, sel.commentSubmit);
    return this.host.ok('execute', { action: this.key, method: 'dom', selector: filled.selector });
  }
}

export class ReplyAction extends BrowserInteractionAction {
  readonly key = 'reply' as const;
  readonly label = 'Reply';

  protected async runInteraction(
    page: Page | null,
    ctx: AutomationActionContext,
  ): Promise<AutomationActionResult> {
    const text = actionText(ctx);
    if (!text) {
      return { ok: false, phase: 'execute', message: 'reply_text_required', data: { action: this.key } };
    }
    if (!page || ctx.dryRun) {
      return this.dryOk('execute', { textLength: text.length });
    }
    const sel = this.host.getInteractionSelectors();
    const filled = await fillFirstMatching(page, sel.replyComposer, text);
    if (!filled.filled) {
      return { ok: false, phase: 'execute', message: 'reply_composer_not_found', data: { action: this.key } };
    }
    await clickFirstMatching(page, sel.replySubmit);
    return this.host.ok('execute', { action: this.key, method: 'dom', selector: filled.selector });
  }
}

export class ReactAction extends BrowserInteractionAction {
  readonly key = 'react' as const;
  readonly label = 'React';

  protected async runInteraction(
    page: Page | null,
    ctx: AutomationActionContext,
  ): Promise<AutomationActionResult> {
    const reaction = actionReaction(ctx);
    if (!page || ctx.dryRun) {
      return this.dryOk('execute', { reaction });
    }
    const sel = this.host.getInteractionSelectors();
    await hoverFirstMatching(page, sel.reactOpen);
    const clicked = await clickFirstMatching(page, sel.reactOption(reaction));
    if (!clicked.clicked) {
      const like = await clickFirstMatching(page, sel.reactOpen);
      if (!like.clicked) {
        return { ok: false, phase: 'execute', message: 'react_control_not_found', data: { action: this.key, reaction } };
      }
    }
    return this.host.ok('execute', { action: this.key, reaction, method: 'dom' });
  }
}

export class MessageAction extends BrowserInteractionAction {
  readonly key = 'message' as const;
  readonly label = 'Message';

  protected async runInteraction(
    page: Page | null,
    ctx: AutomationActionContext,
  ): Promise<AutomationActionResult> {
    const text = actionText(ctx);
    if (!text) {
      return { ok: false, phase: 'execute', message: 'message_text_required', data: { action: this.key } };
    }
    if (!page || ctx.dryRun) {
      return this.dryOk('execute', { textLength: text.length });
    }
    const sel = this.host.getInteractionSelectors();
    const filled = await fillFirstMatching(page, sel.messageComposer, text);
    if (!filled.filled) {
      return { ok: false, phase: 'execute', message: 'message_composer_not_found', data: { action: this.key } };
    }
    await clickFirstMatching(page, sel.messageSend);
    return this.host.ok('execute', { action: this.key, method: 'dom', selector: filled.selector });
  }
}

export class FollowAction extends BrowserInteractionAction {
  readonly key = 'follow' as const;
  readonly label = 'Follow';

  protected async runInteraction(
    page: Page | null,
    ctx: AutomationActionContext,
  ): Promise<AutomationActionResult> {
    if (!page || ctx.dryRun) {
      return this.dryOk('execute', {});
    }
    const sel = this.host.getInteractionSelectors();
    const clicked = await clickFirstMatching(page, sel.followButton);
    if (!clicked.clicked) {
      return { ok: false, phase: 'execute', message: 'follow_button_not_found', data: { action: this.key } };
    }
    return this.host.ok('execute', { action: this.key, method: 'dom', selector: clicked.selector });
  }
}

export class JoinGroupAction extends BrowserInteractionAction {
  readonly key = 'join_group' as const;
  readonly label = 'Join Group';

  protected async runInteraction(
    page: Page | null,
    ctx: AutomationActionContext,
  ): Promise<AutomationActionResult> {
    if (!page || ctx.dryRun) {
      return this.dryOk('execute', {});
    }
    const sel = this.host.getInteractionSelectors();
    const clicked = await clickFirstMatching(page, sel.joinGroupButton);
    if (!clicked.clicked) {
      return { ok: false, phase: 'execute', message: 'join_group_button_not_found', data: { action: this.key } };
    }
    return this.host.ok('execute', { action: this.key, method: 'dom', selector: clicked.selector });
  }
}

export class InviteAction extends BrowserInteractionAction {
  readonly key = 'invite' as const;
  readonly label = 'Invite';

  protected async runInteraction(
    page: Page | null,
    ctx: AutomationActionContext,
  ): Promise<AutomationActionResult> {
    if (!page || ctx.dryRun) {
      return this.dryOk('execute', { textLength: actionText(ctx).length });
    }
    const sel = this.host.getInteractionSelectors();
    const opened = await clickFirstMatching(page, sel.inviteButton);
    if (!opened.clicked) {
      return { ok: false, phase: 'execute', message: 'invite_button_not_found', data: { action: this.key } };
    }
    await clickFirstMatching(page, sel.inviteConfirm);
    return this.host.ok('execute', { action: this.key, method: 'dom' });
  }
}

export function createInteractionActions(host: DestinationActionHost): AutomationAction[] {
  return [
    new CommentAction(host),
    new ReplyAction(host),
    new ReactAction(host),
    new MessageAction(host),
    new FollowAction(host),
    new JoinGroupAction(host),
    new InviteAction(host),
  ];
}
