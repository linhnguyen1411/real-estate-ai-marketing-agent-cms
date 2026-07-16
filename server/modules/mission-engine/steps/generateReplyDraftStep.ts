import type { WorkflowStepHandler } from './stepContract';
import { findOutputByStepType } from './stepHelpers';

export const generateReplyDraftStep: WorkflowStepHandler = {
  type: 'generate_reply_draft',
  async execute(ctx) {
    const summaryOut = findOutputByStepType(ctx, 'summarize');
    const classifyOut = findOutputByStepType(ctx, 'classify_subject');
    const summary =
      typeof summaryOut?.summary === 'string'
        ? summaryOut.summary
        : 'Nội dung chưa được tóm tắt.';

    const classification = classifyOut?.classification ?? 'lead';
    const draftText = `[Draft — chưa gửi] Cảm ơn bạn đã chia sẻ. Chúng tôi đã ghi nhận nhu cầu ${classification}. Tóm tắt: ${summary.slice(0, 120)}`;

    return {
      status: 'completed',
      output: {
        draftText,
        skipped: true,
        reason: 'mvp_stub',
      },
    };
  },
};
