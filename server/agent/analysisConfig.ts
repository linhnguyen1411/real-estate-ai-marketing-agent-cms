/**
 * Resolve lead-analysis config from AgentSource + AgentMission.
 * Applies default RE keyword pack when keywords are empty (does not mutate DB).
 */

import type { AgentMission, AgentSource } from '@prisma/client';
import {
  getDefaultNegativeKeywords,
  getDefaultPositiveKeywords,
} from './defaultKeywordSets';

export type AgentAnalysisMode = 'ai_first' | 'hybrid' | 'keyword_only';

export type AnalysisFilterStage =
  | 'pending'
  | 'passed'
  | 'too_short'
  | 'hard_spam'
  | 'keyword_gate'
  | 'low_final_score'
  | 'budget_exhausted'
  | 'ai_failed'
  | 'ignored_by_rule'
  | 'created_finding';

export interface LeadAnalysisConfig {
  analysisMode: AgentAnalysisMode;
  positiveKeywords: string[];
  negativeKeywords: string[];
  /** Used default pack because source/mission keywords were empty */
  usedDefaultKeywords: boolean;
  minScore: number;
  notifyScore: number;
  /** Soft threshold to prefer AI in hybrid (not a hard gate in ai_first) */
  softKeywordScore: number;
  prefilterMinScore: number;
  minBodyLength: number;
  deepAnalyze: boolean;
  skipAi: boolean;
}

const MODE_SET = new Set<AgentAnalysisMode>(['ai_first', 'hybrid', 'keyword_only']);

export function resolveLeadAnalysisConfig(
  source: AgentSource,
  mission: AgentMission | null,
): LeadAnalysisConfig {
  const sourceConfig = asRecord(source.config);
  const missionRules = asRecord(mission?.rules);

  const sourcePositive = toKeywordList(sourceConfig.positiveKeywords);
  const sourceNegative = toKeywordList(sourceConfig.negativeKeywords);
  const missionPositive = toKeywordList(
    missionRules.keywords ?? missionRules.positiveKeywords,
  );
  const missionNegative = toKeywordList(missionRules.negativeKeywords);

  let positiveKeywords = unique([...sourcePositive, ...missionPositive]);
  let negativeKeywords = unique([...sourceNegative, ...missionNegative]);
  let usedDefaultKeywords = false;

  const allowDefaults =
    sourceConfig.useDefaultKeywords !== false &&
    missionRules.useDefaultKeywords !== false;

  if (allowDefaults && positiveKeywords.length === 0) {
    positiveKeywords = getDefaultPositiveKeywords();
    usedDefaultKeywords = true;
  }
  if (allowDefaults && negativeKeywords.length === 0) {
    negativeKeywords = getDefaultNegativeKeywords();
  }

  const analysisMode = parseMode(
    missionRules.analysisMode ?? sourceConfig.analysisMode ?? process.env.AGENT_ANALYSIS_MODE,
    'hybrid',
  );

  return {
    analysisMode,
    positiveKeywords,
    negativeKeywords,
    usedDefaultKeywords,
    minScore: clampScore(
      missionRules.minFindingScore ?? missionRules.minScore ?? sourceConfig.minScore,
      analysisMode === 'keyword_only' ? 50 : 40,
    ),
    notifyScore: clampScore(missionRules.notifyScore ?? sourceConfig.notifyScore, 75),
    softKeywordScore: clampScore(
      missionRules.softKeywordScore ?? sourceConfig.softKeywordScore,
      20,
    ),
    prefilterMinScore: clampScore(
      missionRules.prefilterMinScore ?? sourceConfig.prefilterMinScore,
      15,
    ),
    minBodyLength: clampInt(
      missionRules.minBodyLength ?? sourceConfig.minBodyLength,
      15,
      500,
      40,
    ),
    deepAnalyze:
      missionRules.deepAnalyze === true || sourceConfig.deepAnalyze === true,
    skipAi: process.env.AGENT_LEAD_ANALYSIS_SKIP_AI === '1',
  };
}

function parseMode(value: unknown, fallback: AgentAnalysisMode): AgentAnalysisMode {
  const raw = String(value || '').trim().toLowerCase();
  if (MODE_SET.has(raw as AgentAnalysisMode)) return raw as AgentAnalysisMode;
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim().toLowerCase()).filter(Boolean);
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function clampScore(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.floor(num)));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}
