import type { WorkflowStepHandler } from './stepContract';
import { requireScannedContent } from './stepHelpers';

const POSITIVE = [
  'tuyệt vời',
  'ưng ý',
  'hài lòng',
  'cảm ơn',
  'ok',
  'tốt',
  'great',
  'love',
  'excellent',
  '👍',
  '❤',
];
const NEGATIVE = [
  'tệ',
  'dở',
  'lừa',
  'scam',
  'bực',
  'chán',
  'thất vọng',
  'bad',
  'hate',
  'worst',
  '👎',
  'lừa đảo',
];

export const sentimentAnalysisStep: WorkflowStepHandler = {
  type: 'sentiment_analysis',
  async execute(ctx) {
    const content = await requireScannedContent(ctx);
    const text = (content.contentText || '').toLowerCase();
    let pos = 0;
    let neg = 0;
    for (const w of POSITIVE) {
      if (text.includes(w)) pos += 1;
    }
    for (const w of NEGATIVE) {
      if (text.includes(w)) neg += 1;
    }

    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (pos > neg) sentiment = 'positive';
    else if (neg > pos) sentiment = 'negative';

    return {
      status: 'completed',
      output: {
        sentiment,
        positiveHits: pos,
        negativeHits: neg,
      },
    };
  },
};
