/**
 * Knowledge service — snapshot, report, compiled rules for Decision Engine.
 */

import {
  compileCampaignMapFromKnowledge,
  compileRulesFromKnowledge,
} from './compile';
import {
  computeCoverage,
  computeHealth,
  listConcepts,
  listSuggestions,
  listUnknownTerms,
  loadKnowledgeState,
} from './store';
import type { KnowledgeSnapshot } from './types';
import type { DecisionRule } from '../decision-center/types';

export async function getCompiledDecisionRules(): Promise<DecisionRule[]> {
  return compileRulesFromKnowledge(await listConcepts());
}

export async function getCompiledCampaignMap(): Promise<
  Array<{ keyword: string; campaignName: string }>
> {
  return compileCampaignMapFromKnowledge(await listConcepts());
}

export async function buildKnowledgeSnapshot(): Promise<KnowledgeSnapshot> {
  const state = await loadKnowledgeState();
  return {
    version: 'h361_kb_v1',
    concepts: state.concepts,
    unknownTerms: state.unknownTerms.filter(t => t.status === 'queued'),
    suggestions: state.suggestions.filter(s => s.status === 'pending'),
    health: computeHealth(state),
    coverage: computeCoverage(state.coverageCounters),
  };
}

export function formatKnowledgeReport(health: ReturnType<typeof computeHealth>): string {
  return [
    'Knowledge Report',
    '',
    'Buyer Concepts',
    String(health.buyerConcepts),
    '',
    'Seller Concepts',
    String(health.sellerConcepts),
    '',
    'Locations',
    String(health.locationAliases),
    '',
    'Unknown',
    String(health.unknownQueue),
    '',
    'Need Review',
    String(health.approvalPending),
    '',
    'Coverage',
    `${health.coveragePercent}%`,
  ].join('\n');
}

export async function getKnowledgeReportText(): Promise<string> {
  const state = await loadKnowledgeState();
  return formatKnowledgeReport(computeHealth(state));
}

export async function getPendingReviewCounts(): Promise<{
  unknown: number;
  suggestions: number;
}> {
  const [unknown, suggestions] = await Promise.all([listUnknownTerms(), listSuggestions('pending')]);
  return { unknown: unknown.length, suggestions: suggestions.length };
}
