/**
 * Follow-up Engine — proactive cooling / engagement suggestions.
 */

import type { BuyerSignal, FollowUpFlag, SalesPipelineStage } from './types';

export function evaluateFollowUp(input: {
  signals: BuyerSignal[];
  pipelineStage: SalesPipelineStage;
  lastActivityAt?: string | null;
  now?: Date;
}): FollowUpFlag {
  const now = input.now || new Date();
  const lastIso =
    input.lastActivityAt ||
    (input.signals.length
      ? input.signals.reduce((a, b) => (a.at > b.at ? a : b)).at
      : null);
  if (!lastIso) {
    return {
      needsFollowUp: false,
      coolingHours: 0,
      reason: null,
      suggestion: null,
    };
  }

  const coolingHours = Math.max(0, (now.getTime() - new Date(lastIso).getTime()) / 3_600_000);
  const terminal = input.pipelineStage === 'won' || input.pipelineStage === 'lost';
  if (terminal) {
    return { needsFollowUp: false, coolingHours, reason: null, suggestion: null };
  }

  const commentCount = input.signals.filter(s => s.kind === 'comment' || s.kind === 'mention').length;
  const viewLike = input.signals.filter(s => s.kind === 'post' || s.kind === 'reaction' || s.kind === 'search')
    .length;

  if (coolingHours >= 72 && input.pipelineStage !== 'detected') {
    return {
      needsFollowUp: true,
      coolingHours: Math.round(coolingHours),
      reason: 'Buyer đang nguội (im lặng ≥72h)',
      suggestion: 'Nên follow-up ngay',
    };
  }

  if (viewLike >= 3 && coolingHours >= 24) {
    return {
      needsFollowUp: true,
      coolingHours: Math.round(coolingHours),
      reason: 'Buyer xem nhiều bài',
      suggestion: 'Đề xuất gọi',
    };
  }

  if (commentCount >= 1 && coolingHours >= 12 && coolingHours < 72) {
    return {
      needsFollowUp: true,
      coolingHours: Math.round(coolingHours),
      reason: 'Buyer đã comment',
      suggestion: 'Đề xuất trả lời',
    };
  }

  if (coolingHours >= 48 && ['qualified', 'assigned', 'contacted'].includes(input.pipelineStage)) {
    return {
      needsFollowUp: true,
      coolingHours: Math.round(coolingHours),
      reason: 'Pipeline đứng yên',
      suggestion: 'Follow-up hoặc remarketing',
    };
  }

  return {
    needsFollowUp: false,
    coolingHours: Math.round(coolingHours),
    reason: null,
    suggestion: null,
  };
}
