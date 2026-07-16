import type { WorkflowStepHandler } from './stepContract';
import { findOutputByStepType, requireScannedContent } from './stepHelpers';

const DEFAULT_MAX_LEN = 280;

export const summarizeStep: WorkflowStepHandler = {
  type: 'summarize',
  async execute(ctx) {
    const content = await requireScannedContent(ctx);
    const maxLen =
      typeof ctx.step.config?.maxLength === 'number'
        ? ctx.step.config.maxLength
        : DEFAULT_MAX_LEN;

    const text = (content.contentText || '').replace(/\s+/g, ' ').trim();
    const summary = text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}…`;

    const prior = findOutputByStepType(ctx, 'summarize');
    if (prior?.summary === summary) {
      return {
        status: 'completed',
        output: { summary },
        idempotent: true,
      };
    }

    return {
      status: 'completed',
      output: { summary, originalLength: text.length },
    };
  },
};
