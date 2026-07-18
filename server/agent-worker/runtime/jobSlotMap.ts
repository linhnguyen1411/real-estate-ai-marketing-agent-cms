/**
 * Map AgentJob.type → Execution Pool slot.
 * Resource routing only — not business logic.
 */

import type { ExecutionSlotKind } from './types';

export function slotKindForJobType(jobType: string): ExecutionSlotKind | null {
  switch (jobType) {
    case 'scan_source':
    case 'source_scan':
      return 'scan';
    case 'publish_social':
      return 'publish';
    case 'send_message':
    case 'messaging':
      return 'messaging';
    case 'post_comment':
    case 'comment':
      return 'comment';
    case 'visit_url':
      // Navigation shares scan browser purpose (Facebook CDP scan tab family).
      return 'scan';
    case 'health_check':
      return null;
    default:
      // Unknown types still need a slot gate — default scan to avoid unbounded concurrency.
      return 'scan';
  }
}
