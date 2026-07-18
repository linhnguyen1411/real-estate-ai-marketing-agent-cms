/**
 * Human-approval gate for browser interaction actions.
 * AI may suggest content; live/dry execute still requires explicit approval.
 */

import type { BrowserDestinationContext } from '../types';

export function isBrowserActionHumanApproved(ctx: BrowserDestinationContext): boolean {
  const cfg = ctx.destinationConfig || {};
  if (cfg.humanApproved === true) return true;
  if (cfg.actionApproved === true) return true;
  if (typeof cfg.approvedBy === 'string' && cfg.approvedBy.trim()) return true;
  if (cfg.approvedAt != null) return true;
  return false;
}

export function browserActionApprovalRequired(ctx: BrowserDestinationContext): boolean {
  const cfg = ctx.destinationConfig || {};
  if (cfg.requireApproval === false) return false;
  return true;
}

export function assertBrowserActionApproved(ctx: BrowserDestinationContext): {
  ok: true;
} | {
  ok: false;
  message: string;
} {
  if (!browserActionApprovalRequired(ctx)) return { ok: true };
  if (isBrowserActionHumanApproved(ctx)) return { ok: true };
  return { ok: false, message: 'human_approval_required' };
}
