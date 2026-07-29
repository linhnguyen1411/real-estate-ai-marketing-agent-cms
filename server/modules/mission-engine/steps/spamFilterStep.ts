import { evaluateContentSpam } from '../../../agent/spam/spamPolicyService';
import type { WorkflowStepHandler } from './stepContract';
import { requireScannedContent } from './stepHelpers';

export const spamFilterStep: WorkflowStepHandler = {
  type: 'spam_filter',
  async execute(ctx) {
    const content = await requireScannedContent(ctx);
    const { decision } = await evaluateContentSpam({
      contentText: content.contentText,
      authorName: content.authorName,
      authorUrl: content.authorUrl,
      canonicalUrl: content.canonicalUrl,
      contentHash: content.contentHash,
      normalizedContentHash: content.normalizedContentHash,
      nearDuplicateFingerprint: content.nearDuplicateFingerprint,
      sourceId: content.sourceId,
      companyId: content.companyId,
      tier: 'pre_ai',
    });

    const blocked = decision.decision === 'block';
    const ignored = decision.decision === 'ignore';

    if (blocked || ignored) {
      return {
        status: 'skipped',
        output: {
          decision: decision.decision,
          blocked,
          reasonCode: decision.primaryReason,
          matchedRuleIds: decision.matchedRules.map(r => r.ruleId).slice(0, 8),
        },
        warnings: blocked ? ['Content blocked by spam policy'] : ['Content ignored by spam policy'],
      };
    }

    return {
      status: 'completed',
      output: {
        decision: 'allow',
        blocked: false,
      },
    };
  },
};
