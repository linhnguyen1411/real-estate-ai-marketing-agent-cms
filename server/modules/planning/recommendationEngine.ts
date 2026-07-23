/**
 * Recommendation Engine — proactive campaign suggestions (planning layer).
 */

import { createHash } from 'node:crypto';
import type { CampaignBoard, ContentPlan, MarketIntelligenceReport, RecommendationItem } from './types';

export function buildCampaignRecommendations(input: {
  board?: CampaignBoard | null;
  research?: MarketIntelligenceReport | null;
  content?: ContentPlan | null;
}): RecommendationItem[] {
  const items: RecommendationItem[] = [];
  const name = input.board?.name || input.research?.propertyHint || 'Campaign';

  const push = (
    severity: RecommendationItem['severity'],
    message: string,
    actionLabel: string,
    command?: string,
  ) => {
    items.push({
      id: `rec_${createHash('sha1').update(message).digest('hex').slice(0, 10)}`,
      campaignName: name,
      severity,
      message,
      actionLabel,
      command: command ?? null,
    });
  };

  const channels = new Set((input.content?.schedule || []).map(s => s.channel.toLowerCase()));
  if (!channels.has('threads')) {
    push('warn', `${name}: thiếu bài Threads trong lịch hôm nay.`, 'Lên Content Threads', '/ai content');
  }
  if (![...channels].some(c => c.includes('seo'))) {
    push('warn', `${name}: thiếu bài SEO / outline.`, 'Lên Content SEO', '/ai content');
  }

  if (input.research?.avgPricePerSqm && input.research.maxPricePerSqm) {
    const avg = input.research.avgPricePerSqm;
    const max = input.research.maxPricePerSqm;
    const premium = Math.round(((max - avg) / avg) * 100);
    if (premium >= 6) {
      push(
        'critical',
        `${name}: giá đang cao hơn thị trường ~${premium}% (TB ${avg} vs đỉnh ${max}). Nên giảm ~2%.`,
        'Xem Research',
        '/ai research',
      );
    }
  }

  if (input.board?.priority === 'high' || input.board?.priority === 'urgent') {
    push('info', `${name}: priority cao — ưu tiên Mission Buyer + đăng Group 18:00.`, 'Xem Mission', '/ai mission');
  }

  if (!items.length) {
    push('info', `${name}: lịch ổn — tiếp tục theo dõi lead VIP.`, 'Xem Leads', '/ai leads');
  }

  return items;
}
