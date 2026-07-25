/**
 * Action Engine — suggest next sales action per lead.
 */

import type {
  ActionRecommendation,
  BuyingTimeline,
  IntentDetectionResult,
  PriorityBreakdown,
} from './types';

export function suggestLeadAction(input: {
  intent: IntentDetectionResult;
  timeline: BuyingTimeline;
  priority: PriorityBreakdown;
  hasPhone?: boolean;
}): ActionRecommendation {
  if (input.intent.intent === 'non_buyer') {
    return { action: 'ignore', label: 'Ignore', reason: 'Không phải buyer (supply/spam signal)' };
  }

  if (
    input.intent.intent === 'ready_buyer' ||
    input.timeline === 'buying_today' ||
    input.priority.finalScore >= 85
  ) {
    return {
      action: input.hasPhone ? 'call' : 'inbox',
      label: input.hasPhone ? 'Gọi ngay' : 'Inbox ngay',
      reason: 'Ready / urgency cao — ưu tiên liên hệ ngay',
    };
  }

  if (input.priority.finalScore >= 70 || input.timeline === 'within_7_days') {
    return {
      action: input.hasPhone ? 'call' : 'assign',
      label: input.hasPhone ? 'Call' : 'Assign Sales',
      reason: 'Qualified buyer — giao sales xử lý',
    };
  }

  if (input.intent.intent === 'warm_lead' || input.intent.intent === 'potential_buyer') {
    return { action: 'comment', label: 'Comment / nurture', reason: 'Warm — nuôi dưỡng qua comment/inbox' };
  }

  if (input.intent.intent === 'research_phase') {
    return { action: 'monitor', label: 'Monitor', reason: 'Đang research pháp lý — theo dõi thêm tín hiệu' };
  }

  if (input.priority.finalScore >= 55) {
    return { action: 'crm', label: 'Đưa vào CRM', reason: 'Đủ tín hiệu để lưu CRM theo dõi' };
  }

  return { action: 'monitor', label: 'Monitor', reason: 'Tín hiệu yếu — tiếp tục theo dõi' };
}
