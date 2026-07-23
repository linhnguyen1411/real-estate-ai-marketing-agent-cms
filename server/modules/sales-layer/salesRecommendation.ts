/**
 * Sales Recommendation — actionable next step (not just score).
 */

import type {
  BuyerJourneyStage,
  FollowUpFlag,
  SalesPipelineStage,
  SalesRecommendation,
} from './types';

export function recommendSalesAction(input: {
  confidencePct: number;
  journeyStage: BuyerJourneyStage;
  pipelineStage: SalesPipelineStage;
  followUp: FollowUpFlag;
  hasPhone?: boolean;
}): SalesRecommendation {
  if (input.pipelineStage === 'won' || input.journeyStage === 'closed_won') {
    return {
      code: 'monitor',
      label: 'Đã chốt — monitor aftercare',
      reason: 'Closed Won',
      urgency: 'low',
    };
  }
  if (input.pipelineStage === 'lost' || input.journeyStage === 'closed_lost') {
    return {
      code: 'remarket',
      label: 'Remarketing nhẹ',
      reason: 'Closed Lost — nuôi lại dài hạn',
      urgency: 'low',
    };
  }

  if (input.confidencePct >= 90 || input.journeyStage === 'negotiating' || input.pipelineStage === 'negotiating') {
    return {
      code: 'call_now',
      label: 'Gọi ngay hôm nay',
      reason: `Buyer ${input.confidencePct}% · Journey ${input.journeyStage}`,
      urgency: 'urgent',
    };
  }

  if (input.followUp.needsFollowUp && /nguội|im lặng/i.test(input.followUp.reason || '')) {
    return {
      code: 'remarket',
      label: 'Đã nguội — nên remarketing',
      reason: input.followUp.reason || 'Cooling',
      urgency: 'soon',
    };
  }

  if (input.followUp.suggestion?.includes('gọi') || (input.hasPhone && input.confidencePct >= 75)) {
    return {
      code: 'call_now',
      label: 'Nên gọi ngay',
      reason: input.followUp.reason || 'Đủ tín hiệu gọi',
      urgency: 'urgent',
    };
  }

  if (
    input.journeyStage === 'researching' ||
    input.journeyStage === 'comparing' ||
    input.followUp.suggestion?.includes('báo giá')
  ) {
    return {
      code: 'send_quote',
      label: 'Chưa nên gọi — gửi báo giá',
      reason: 'Đang research/so sánh',
      urgency: 'normal',
    };
  }

  if (input.followUp.suggestion?.includes('trả lời') || input.journeyStage === 'interested') {
    return {
      code: 'reply_comment',
      label: 'Trả lời comment / nurture',
      reason: input.followUp.reason || 'Engagement',
      urgency: 'soon',
    };
  }

  if (input.pipelineStage === 'detected' || input.pipelineStage === 'qualified') {
    return {
      code: 'assign',
      label: 'Assign Sales',
      reason: 'Đưa vào pipeline xử lý',
      urgency: 'normal',
    };
  }

  if (input.followUp.needsFollowUp) {
    return {
      code: 'follow_up',
      label: input.followUp.suggestion || 'Follow-up',
      reason: input.followUp.reason || 'Cần theo dõi',
      urgency: 'soon',
    };
  }

  return {
    code: 'monitor',
    label: 'Monitor',
    reason: 'Tiếp tục theo dõi hành trình',
    urgency: 'low',
  };
}
