/**
 * AI gate before AgentFinding create: accept only real demand-side leads.
 * Brokers / supply listings are rejected even if keywords matched.
 */

import type { LeadAnalysisResult } from './leadAnalysisSchema';

export type AiGateDecision =
  | { accept: true }
  | { accept: false; rejectReason: string };

const REJECT_CLASSIFICATIONS = new Set([
  'broker',
  'seller',
  'landlord',
  'spam',
  'discussion',
  'service',
  'unknown',
]);

export function decideAiFindingGate(
  analysis: LeadAnalysisResult,
  targetClassifications: string[],
): AiGateDecision {
  if (analysis.isRealEstateRelevant === false) {
    return { accept: false, rejectReason: 'ai_out_of_domain' };
  }

  // Never promote brokers into Lead Center — main quality complaint.
  if (
    analysis.classification === 'broker' ||
    analysis.actorRole === 'broker' ||
    analysis.supplyType === 'broker_listing'
  ) {
    return { accept: false, rejectReason: 'ai_broker_reject' };
  }

  if (analysis.actorRole === 'supply_side') {
    return { accept: false, rejectReason: 'ai_supply_side' };
  }

  if (REJECT_CLASSIFICATIONS.has(analysis.classification)) {
    return { accept: false, rejectReason: `ai_reject_${analysis.classification}` };
  }

  if (!targetClassifications.includes(analysis.classification)) {
    return { accept: false, rejectReason: 'ai_not_target_classification' };
  }

  if (analysis.actorRole !== 'demand_side' && analysis.demandType === 'none') {
    return { accept: false, rejectReason: 'ai_no_demand_signal' };
  }

  return { accept: true };
}
