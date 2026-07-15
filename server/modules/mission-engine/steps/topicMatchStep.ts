import { scoreContent } from '../../../agent-worker/services/findingRuleEngine';
import type { WorkflowStepHandler } from './stepContract';
import { contentTitle, getMissionRules, requireScannedContent } from './stepHelpers';

function resolveKeywords(ctx: Parameters<WorkflowStepHandler['execute']>[0]): string[] {
  const fromConfig = ctx.step.config?.topics ?? ctx.step.config?.positiveKeywords;
  if (Array.isArray(fromConfig)) {
    return fromConfig.map(String).filter(Boolean);
  }
  const rules = getMissionRules(ctx);
  const fromRules = rules.positiveKeywords ?? rules.keywords;
  if (Array.isArray(fromRules)) {
    return fromRules.map(String).filter(Boolean);
  }
  return [];
}

export const topicMatchStep: WorkflowStepHandler = {
  type: 'topic_match',
  async execute(ctx) {
    const content = await requireScannedContent(ctx);
    const keywords = resolveKeywords(ctx);
    if (!keywords.length) {
      return {
        status: 'completed',
        output: { matched: true, keywordScore: 0, matchedKeywords: [] },
        warnings: ['No positive keywords configured — topic match passes by default'],
      };
    }

    const title = contentTitle(content);
    const scored = scoreContent(title, content.contentText, {
      positiveKeywords: keywords,
      negativeKeywords: [],
    });

    const minScore =
      typeof ctx.step.config?.minScore === 'number' ? ctx.step.config.minScore : 1;
    const matched = scored.score >= minScore;

    return {
      status: matched ? 'completed' : 'skipped',
      output: {
        matched,
        keywordScore: scored.score,
        matchedKeywords: scored.matchedPositive.slice(0, 10),
        finalScore: scored.score,
      },
    };
  },
};
