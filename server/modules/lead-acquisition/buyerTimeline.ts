/**
 * Buying timeline prediction — rule heuristics (no Gemini).
 */

import type { BuyingTimeline, BuyerIntentLabel } from './types';

export function predictBuyingTimeline(input: {
  text: string;
  intent: BuyerIntentLabel;
}): BuyingTimeline {
  const t = String(input.text || '').toLowerCase();

  if (/hôm\s*nay|ngay\s*hôm\s*nay|đi\s*xem\s*luôn|cọc\s*ngay|chốt\s*hôm\s*nay/.test(t)) {
    return 'buying_today';
  }
  if (/tuần\s*này|vài\s*ngày|trong\s*tuần|< ?7|gấp|urgent|sớm/.test(t) || input.intent === 'ready_buyer') {
    return 'within_7_days';
  }
  if (/tháng\s*này|tháng\s*sau|30\s*ngày|cuối\s*tháng/.test(t) || input.intent === 'buyer') {
    return 'within_30_days';
  }
  if (/tìm\s*hiểu|tham\s*khảo|nghiên\s*cứu|pháp\s*lý|lâu\s*dài/.test(t) || input.intent === 'research_phase') {
    return 'researching';
  }
  if (/năm\s*sau|từ\s*từ|chưa\s*vội|long\s*term/.test(t)) return 'long_term';
  if (input.intent === 'warm_lead' || input.intent === 'potential_buyer') return 'researching';
  if (input.intent === 'investor') return 'within_30_days';
  return 'unknown';
}

export function timelineScore(timeline: BuyingTimeline): number {
  switch (timeline) {
    case 'buying_today':
      return 100;
    case 'within_7_days':
      return 85;
    case 'within_30_days':
      return 65;
    case 'researching':
      return 40;
    case 'long_term':
      return 20;
    default:
      return 30;
  }
}
