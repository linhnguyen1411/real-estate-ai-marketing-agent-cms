/**
 * Campaign Health + Learning — marketing KPIs (Publisher = data source).
 */

import type { CampaignHealthMetrics, MarketingLearningState } from './types';

export function computeMarketingHealth(input: {
  contentProduced: number;
  published: number;
  reused: number;
  comments: number;
  needReply: number;
  buyerConversations: number;
  trendingTopics: number;
  seoGaps: number;
  failedJobs?: number;
}): CampaignHealthMetrics {
  const pubRate =
    input.contentProduced > 0 ? input.published / Math.max(1, input.contentProduced) : 0;
  const replyLoad = input.comments > 0 ? input.needReply / input.comments : 0;
  let health = 70;
  health += Math.min(15, input.published * 2);
  health += Math.min(10, input.reused);
  health += Math.min(8, input.buyerConversations * 2);
  health -= Math.min(20, (input.failedJobs || 0) * 4);
  health -= Math.min(15, Math.round(replyLoad * 20));
  health -= Math.min(10, input.seoGaps);
  health = Math.max(20, Math.min(99, Math.round(health)));

  const engagement = Math.min(100, input.comments * 3 + input.buyerConversations * 8);
  const reach = Math.min(10000, input.published * 420 + input.reused * 180);
  const ctr = Math.round((4 + pubRate * 6 + input.buyerConversations * 0.4) * 10) / 10;

  let recommendation = 'Giữ nhịp lịch calendar tuần này.';
  if (input.needReply >= 5) recommendation = `Ưu tiên trả lời ${input.needReply} comment đang chờ.`;
  else if (input.seoGaps >= 3) recommendation = 'Đóng SEO gap — viết 1 pillar + landing CTA.';
  else if (input.published < 3) recommendation = 'Tăng distribution — duyệt thêm draft lên lịch.';
  else if (input.trendingTopics > 0) {
    recommendation = `Nên quay thêm 1 video về topic đang trend.`;
  }

  return {
    healthScore: health,
    contentProduced: input.contentProduced,
    published: input.published,
    reused: input.reused,
    comments: input.comments,
    needReply: input.needReply,
    buyerConversations: input.buyerConversations,
    trendingTopics: input.trendingTopics,
    seoGaps: input.seoGaps,
    reach,
    engagement,
    ctr,
    saves: Math.round(input.published * 2.2),
    shares: Math.round(input.published * 1.4),
    traffic: Math.round(reach * (ctr / 100)),
    roiHint: input.buyerConversations >= 3 ? 'Conversation → Lead ổn' : 'Cần tăng CTA buyer',
    recommendation,
  };
}

export function updateMarketingLearning(
  prev: MarketingLearningState | null,
  input: { format?: string; hour?: string; cta?: string; campaign?: string; note?: string },
): MarketingLearningState {
  const base: MarketingLearningState = prev || {
    bestFormats: [],
    bestHours: [],
    bestCtas: [],
    bestCampaigns: [],
    notes: [],
    updatedAt: new Date().toISOString(),
  };
  const push = (arr: string[], v?: string) => {
    if (!v) return arr;
    return [...new Set([v, ...arr])].slice(0, 8);
  };
  return {
    bestFormats: push(base.bestFormats, input.format),
    bestHours: push(base.bestHours, input.hour),
    bestCtas: push(base.bestCtas, input.cta),
    bestCampaigns: push(base.bestCampaigns, input.campaign),
    notes: push(base.notes, input.note),
    updatedAt: new Date().toISOString(),
  };
}
