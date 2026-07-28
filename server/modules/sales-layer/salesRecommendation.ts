/**
 * Sales Recommendation — actionable next step from real sales context.
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
  hasBudget?: boolean;
  hasLocation?: boolean;
  timelineUrgent?: boolean;
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
      label: 'Đưa vào remarketing',
      reason: 'Closed Lost — nuôi lại dài hạn',
      urgency: 'low',
    };
  }

  if (input.confidencePct < 40) {
    return {
      code: 'monitor',
      label: 'Chưa nên liên hệ — tín hiệu chưa đủ mạnh',
      reason: `Buyer confidence ${input.confidencePct}%`,
      urgency: 'low',
    };
  }

  if (
    input.confidencePct >= 80 ||
    input.journeyStage === 'negotiating' ||
    input.pipelineStage === 'negotiating' ||
    input.timelineUrgent
  ) {
    return {
      code: 'call_now',
      label: input.hasPhone ? 'Gọi ngay' : 'Inbox ngay',
      reason: `Buyer ${input.confidencePct}% · ${input.journeyStage}`,
      urgency: 'urgent',
    };
  }

  if (input.followUp.needsFollowUp && /nguội|im lặng/i.test(input.followUp.reason || '')) {
    return {
      code: 'remarket',
      label: 'Đưa vào remarketing',
      reason: input.followUp.reason || 'Cooling',
      urgency: 'soon',
    };
  }

  if (!input.hasBudget) {
    return {
      code: 'reply_comment',
      label: 'Hỏi lại ngân sách',
      reason: 'Thiếu ngân sách — cần clarify trước khi báo giá',
      urgency: 'soon',
    };
  }

  if (
    input.journeyStage === 'researching' ||
    input.journeyStage === 'comparing' ||
    input.followUp.suggestion?.includes('báo giá')
  ) {
    return {
      code: 'send_quote',
      label: 'Gửi 3 sản phẩm phù hợp',
      reason: input.hasLocation
        ? 'Đủ khu vực — gửi listing match'
        : 'Đang research/so sánh',
      urgency: 'normal',
    };
  }

  if (input.followUp.suggestion?.includes('gọi') || (input.hasPhone && input.confidencePct >= 70)) {
    return {
      code: 'call_now',
      label: input.hasPhone ? 'Gọi ngay' : 'Inbox ngay',
      reason: input.followUp.reason || 'Đủ tín hiệu liên hệ',
      urgency: 'urgent',
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

  if (input.followUp.needsFollowUp) {
    return {
      code: 'follow_up',
      label: 'Follow-up trong 24h',
      reason: input.followUp.reason || 'Cần theo dõi',
      urgency: 'soon',
    };
  }

  if (input.pipelineStage === 'detected' || input.pipelineStage === 'qualified') {
    return {
      code: 'assign',
      label: input.hasPhone ? 'Gọi và giao sales' : 'Giao sales — hỏi ngân sách',
      reason: 'Qualified buyer — đưa vào pipeline',
      urgency: 'normal',
    };
  }

  return {
    code: 'monitor',
    label: 'Theo dõi thêm tín hiệu',
    reason: 'Tiếp tục theo dõi hành trình',
    urgency: 'low',
  };
}
