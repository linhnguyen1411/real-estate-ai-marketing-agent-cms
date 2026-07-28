/**
 * Rule Library + metrics + decision cache — AppSetting persistence.
 */

import { prisma } from '../../prisma';
import { DEFAULT_CAMPAIGN_MAP, DEFAULT_DECISION_RULES } from './defaultRules';
import type {
  DecisionMetrics,
  DecisionOutcome,
  DecisionRule,
  LeadDecisionResult,
} from './types';

const SETTING_KEY = 'lead_decision_center_h36';

type CacheEntry = {
  hash: string;
  decision: LeadDecisionResult;
  at: string;
};

type StoredState = {
  rules: DecisionRule[];
  campaignMap: Array<{ keyword: string; campaignName: string }>;
  metrics: DecisionMetrics;
  cache: CacheEntry[];
  recent: Array<{
    findingId: string;
    title: string;
    ruleScore: number;
    intent: LeadDecisionResult['intent'];
    decision: DecisionOutcome;
    aiUsed: boolean;
    reason: string;
    matchedRules: string[];
    at: string;
  }>;
};

function emptyMetrics(): DecisionMetrics {
  return {
    scanned: 0,
    discarded: 0,
    rulePassed: 0,
    aiReviewed: 0,
    qualified: 0,
    converted: 0,
    manualReview: 0,
    cacheHits: 0,
    aiSavingPercent: 0,
    updatedAt: new Date().toISOString(),
  };
}

function recomputeSaving(m: DecisionMetrics): number {
  if (!m.scanned) return 0;
  const aiCalls = m.aiReviewed;
  const saved = Math.max(0, m.scanned - aiCalls);
  return Math.round((saved / m.scanned) * 1000) / 10;
}

async function loadState(): Promise<StoredState> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  const data = (row?.data || {}) as Partial<StoredState>;
  const storedRules =
    Array.isArray(data.rules) && data.rules.length ? data.rules : [...DEFAULT_DECISION_RULES];
  const { rules, added } = mergeDefaultRules(storedRules, DEFAULT_DECISION_RULES);
  const state: StoredState = {
    rules,
    campaignMap:
      Array.isArray(data.campaignMap) && data.campaignMap.length
        ? data.campaignMap
        : [...DEFAULT_CAMPAIGN_MAP],
    metrics: { ...emptyMetrics(), ...(data.metrics || {}) },
    cache: Array.isArray(data.cache) ? data.cache.slice(-500) : [],
    recent: Array.isArray(data.recent) ? data.recent.slice(0, 200) : [],
  };
  // Persist additive defaults once so Admin library stays complete without overwrite.
  if (added > 0 && Array.isArray(data.rules) && data.rules.length) {
    await saveState(state).catch(() => undefined);
  }
  return state;
}

/** Add missing default rule IDs only — never overwrite admin-edited rules. */
export function mergeDefaultRules(
  stored: DecisionRule[],
  defaults: DecisionRule[],
): { rules: DecisionRule[]; added: number } {
  const byId = new Map<string, DecisionRule>();
  for (const rule of stored) {
    if (rule?.id) byId.set(rule.id, rule);
  }
  let added = 0;
  for (const rule of defaults) {
    if (!byId.has(rule.id)) {
      byId.set(rule.id, rule);
      added += 1;
    }
  }
  const rules = [...byId.values()].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return { rules, added };
}

async function saveState(state: StoredState): Promise<void> {
  state.metrics.aiSavingPercent = recomputeSaving(state.metrics);
  state.metrics.updatedAt = new Date().toISOString();
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, data: state as object },
    update: { data: state as object },
  });
}

export async function listDecisionRules(): Promise<DecisionRule[]> {
  // H3.6.1 — Rules compile from Knowledge Base (no hardcoded engine dependency)
  try {
    const { getCompiledDecisionRules } = await import('../knowledge-base');
    const compiled = await getCompiledDecisionRules();
    if (compiled.length) {
      // Additive merge: proven default keywords (H2.4.3) must not be dropped when KB lags.
      const { rules } = mergeDefaultRules(compiled, DEFAULT_DECISION_RULES);
      return rules.sort((a, b) => a.priority - b.priority || a.keyword.localeCompare(b.keyword));
    }
  } catch (err) {
    console.warn('[decision-center] KB compile failed, using stored rules:', err);
  }
  const state = await loadState();
  return [...state.rules].sort((a, b) => a.priority - b.priority || a.keyword.localeCompare(b.keyword));
}

export async function getCampaignMap(): Promise<Array<{ keyword: string; campaignName: string }>> {
  try {
    const { getCompiledCampaignMap } = await import('../knowledge-base');
    const compiled = await getCompiledCampaignMap();
    if (compiled.length) return compiled;
  } catch {
    /* fall through */
  }
  return (await loadState()).campaignMap;
}

export async function upsertDecisionRule(rule: DecisionRule): Promise<DecisionRule[]> {
  const state = await loadState();
  const idx = state.rules.findIndex(r => r.id === rule.id);
  if (idx >= 0) state.rules[idx] = rule;
  else state.rules.push(rule);
  await saveState(state);
  // Mirror into Knowledge Base
  try {
    const { learnFromAdminRule } = await import('../knowledge-base');
    await learnFromAdminRule({
      keyword: rule.keyword,
      weight: rule.weight,
      category: rule.category as import('../knowledge-base').KnowledgeCategory,
      group: rule.group,
    });
  } catch (err) {
    console.warn('[decision-center] KB learnFromAdminRule failed:', err);
  }
  return listDecisionRules();
}

export async function deleteDecisionRule(id: string): Promise<DecisionRule[]> {
  const state = await loadState();
  state.rules = state.rules.filter(r => r.id !== id);
  await saveState(state);
  return state.rules;
}

export async function importDecisionRules(rules: DecisionRule[]): Promise<DecisionRule[]> {
  const state = await loadState();
  state.rules = rules.filter(r => r.keyword && typeof r.weight === 'number');
  await saveState(state);
  return state.rules;
}

export async function resetDecisionRulesToDefault(): Promise<DecisionRule[]> {
  try {
    const { resetConceptsToDefault, getCompiledDecisionRules } = await import('../knowledge-base');
    await resetConceptsToDefault();
    return getCompiledDecisionRules();
  } catch (err) {
    console.warn('[decision-center] KB reset failed:', err);
  }
  const state = await loadState();
  state.rules = [...DEFAULT_DECISION_RULES];
  state.campaignMap = [...DEFAULT_CAMPAIGN_MAP];
  await saveState(state);
  return state.rules;
}

export async function getCachedDecision(hash: string): Promise<LeadDecisionResult | null> {
  const state = await loadState();
  const hit = state.cache.find(c => c.hash === hash);
  return hit ? { ...hit.decision, cacheHit: true } : null;
}

export async function putCachedDecision(result: LeadDecisionResult): Promise<void> {
  const state = await loadState();
  state.cache = [
    { hash: result.contentHash, decision: result, at: result.at },
    ...state.cache.filter(c => c.hash !== result.contentHash),
  ].slice(0, 500);
  await saveState(state);
}

export async function recordDecisionMetrics(input: {
  decision: DecisionOutcome;
  aiUsed: boolean;
  cacheHit: boolean;
}): Promise<DecisionMetrics> {
  const state = await loadState();
  state.metrics.scanned += 1;
  if (input.cacheHit) state.metrics.cacheHits += 1;
  if (input.decision === 'discard') state.metrics.discarded += 1;
  if (input.decision === 'manual_review') state.metrics.manualReview += 1;
  if (input.decision === 'qualified_candidate') {
    state.metrics.qualified += 1;
    state.metrics.rulePassed += 1;
  }
  if (input.decision === 'ai_review') {
    state.metrics.rulePassed += 1;
    // aiReviewed counted later when AI actually runs
  }
  if (input.aiUsed) {
    state.metrics.aiReviewed += 1;
  }
  await saveState(state);
  return state.metrics;
}

export async function recordAiReviewed(): Promise<DecisionMetrics> {
  const state = await loadState();
  state.metrics.aiReviewed += 1;
  await saveState(state);
  return state.metrics;
}

export async function pushRecentDecision(row: StoredState['recent'][number]): Promise<void> {
  const state = await loadState();
  state.recent = [row, ...state.recent.filter(r => r.findingId !== row.findingId)].slice(0, 200);
  await saveState(state);
}

export async function getDecisionMetrics(): Promise<DecisionMetrics> {
  const m = (await loadState()).metrics;
  return { ...m, aiSavingPercent: recomputeSaving(m) };
}

export async function getRecentDecisions(limit = 50): Promise<StoredState['recent']> {
  return (await loadState()).recent.slice(0, limit);
}

export async function exportDecisionLibrary(): Promise<{
  rules: DecisionRule[];
  campaignMap: Array<{ keyword: string; campaignName: string }>;
}> {
  const state = await loadState();
  return { rules: state.rules, campaignMap: state.campaignMap };
}
