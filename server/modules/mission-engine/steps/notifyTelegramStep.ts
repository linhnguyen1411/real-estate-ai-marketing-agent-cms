import { notifyFindingIfEligible } from '../../../notifications/telegramNotificationService';
import type { WorkflowStepHandler } from './stepContract';
import { findOutputByStepType, resolveFindingId } from './stepHelpers';

export const notifyTelegramStep: WorkflowStepHandler = {
  type: 'notify_telegram',
  async execute(ctx) {
    const mode = String(ctx.step.config?.mode || 'finding');
    const findingId = resolveFindingId(ctx);

    if (findingId) {
      const minimumScore =
        typeof ctx.step.config?.minimumScore === 'number'
          ? ctx.step.config.minimumScore
          : undefined;
      const findingOut = findOutputByStepType(ctx, 'create_lead_intelligence');
      const score =
        typeof findingOut?.finalScore === 'number'
          ? findingOut.finalScore
          : typeof findingOut?.keywordScore === 'number'
            ? findingOut.keywordScore
            : null;

      if (minimumScore != null && score != null && score < minimumScore) {
        return {
          status: 'skipped',
          output: { sent: false, reason: 'below_minimum_score', score },
        };
      }

      const result = await notifyFindingIfEligible({ findingId });
      return {
        status: result.ok ? 'completed' : 'skipped',
        output: {
          sent: result.ok,
          skipped: result.skipped ?? false,
          reason: result.reason,
          messageId: result.messageId,
        },
        metrics: result.ok ? { telegramSent: 1 } : undefined,
      };
    }

    if (mode === 'summary') {
      return {
        status: 'skipped',
        output: { sent: false, reason: 'summary_mode_no_generic_send' },
        warnings: ['Telegram summary mode not supported — no generic send API; skipped'],
      };
    }

    return {
      status: 'skipped',
      output: { sent: false, reason: 'no_finding_id' },
      warnings: ['notify_telegram skipped — no findingId'],
    };
  },
};
