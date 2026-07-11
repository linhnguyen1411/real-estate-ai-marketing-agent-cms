import type { AgentMission, AgentSource, ScannedContent } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import {
  resolveLeadAnalysisConfig,
  type AnalysisFilterStage,
  type LeadAnalysisConfig,
} from '../../agent/analysisConfig';
import { analyzeLeadContent, getLeadAnalysisLimits } from '../../agent/leadAnalyzer';
import { notifyFindingHighScore } from '../../agent/agentNotificationService';
import { runLeadPrefilter } from '../../agent/leadPrefilter';

export interface RuleSet {
  positiveKeywords: string[];
  negativeKeywords: string[];
  minScore: number;
  notifyScore: number;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
  matchedPositive: string[];
  matchedNegative: string[];
}

export interface FindingProcessResult {
  findingCreated: boolean;
  notificationCreated: boolean;
  score: number;
  analysisRan?: boolean;
  ignoredByRule?: boolean;
  filterStage?: AnalysisFilterStage;
  keywordScore?: number;
  prefilterScore?: number;
  aiScore?: number | null;
  finalScore?: number;
  analysisMode?: string;
}

export interface AnalysisBudget {
  used: number;
  max: number;
}

/** @deprecated Prefer resolveLeadAnalysisConfig — kept for callers/tests */
export function resolveRuleSet(
  source: AgentSource,
  mission: AgentMission | null,
): RuleSet {
  const config = resolveLeadAnalysisConfig(source, mission);
  return {
    positiveKeywords: config.positiveKeywords,
    negativeKeywords: config.negativeKeywords,
    minScore: config.minScore,
    notifyScore: config.notifyScore,
  };
}

export function scoreContent(
  title: string,
  bodyText: string,
  rules: Pick<RuleSet, 'positiveKeywords' | 'negativeKeywords'>,
): ScoreResult {
  const haystackTitle = title.toLowerCase();
  const haystackBody = bodyText.toLowerCase();
  const reasons: string[] = [];
  const matchedPositive: string[] = [];
  const matchedNegative: string[] = [];
  let score = 0;

  for (const keyword of rules.positiveKeywords) {
    const inTitle = haystackTitle.includes(keyword);
    const inBody = haystackBody.includes(keyword);
    if (!inTitle && !inBody) continue;
    matchedPositive.push(keyword);
    if (inTitle) {
      score += 15;
      reasons.push(`+15 từ khóa "${keyword}" trong tiêu đề`);
    }
    if (inBody) {
      score += 10;
      reasons.push(`+10 từ khóa "${keyword}" trong nội dung`);
    }
  }

  for (const keyword of rules.negativeKeywords) {
    if (haystackTitle.includes(keyword) || haystackBody.includes(keyword)) {
      matchedNegative.push(keyword);
      score -= 20;
      reasons.push(`-20 từ khóa loại trừ "${keyword}"`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, reasons, matchedPositive, matchedNegative };
}

export function computeFinalScore(input: {
  keywordScore: number;
  aiScore: number | null;
  analysisMode: LeadAnalysisConfig['analysisMode'];
}): number {
  const { keywordScore, aiScore, analysisMode } = input;
  if (analysisMode === 'keyword_only' || aiScore == null) {
    return keywordScore;
  }
  if (analysisMode === 'ai_first') {
    // AI primary; keyword can boost slightly when aligned
    return Math.max(aiScore, Math.round(aiScore * 0.7 + keywordScore * 0.3));
  }
  // hybrid
  return Math.max(keywordScore, aiScore, Math.round(keywordScore * 0.4 + aiScore * 0.6));
}

export async function processFindingForContent(input: {
  content: ScannedContent;
  source: AgentSource;
  mission: AgentMission | null;
  rules?: RuleSet;
  title: string;
  analysisBudget?: AnalysisBudget;
}): Promise<FindingProcessResult> {
  const config = resolveLeadAnalysisConfig(input.source, input.mission);
  const rules: RuleSet = input.rules ?? {
    positiveKeywords: config.positiveKeywords,
    negativeKeywords: config.negativeKeywords,
    minScore: config.minScore,
    notifyScore: config.notifyScore,
  };

  const scored = scoreContent(input.title, input.content.contentText, rules);
  const keywordScore = scored.score;

  const prefilter = runLeadPrefilter({
    title: input.title,
    bodyText: input.content.contentText,
    positiveKeywords: config.positiveKeywords,
    negativeKeywords: config.negativeKeywords,
    prefilterMinScore: config.prefilterMinScore,
    minBodyLength: config.minBodyLength,
  });

  if (prefilter.isHardSpam) {
    await persistContentAnalysis(input.content.id, {
      filterStage: 'hard_spam',
      analysisMode: config.analysisMode,
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore: null,
      finalScore: 0,
      usedDefaultKeywords: config.usedDefaultKeywords,
      reasons: prefilter.reasons,
    });
    return {
      findingCreated: false,
      notificationCreated: false,
      score: 0,
      ignoredByRule: true,
      filterStage: 'hard_spam',
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore: null,
      finalScore: 0,
      analysisMode: config.analysisMode,
    };
  }

  if (input.content.contentText.trim().length < config.minBodyLength) {
    await persistContentAnalysis(input.content.id, {
      filterStage: 'too_short',
      analysisMode: config.analysisMode,
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore: null,
      finalScore: 0,
      usedDefaultKeywords: config.usedDefaultKeywords,
      reasons: [`Nội dung < ${config.minBodyLength} ký tự`],
    });
    return {
      findingCreated: false,
      notificationCreated: false,
      score: 0,
      ignoredByRule: true,
      filterStage: 'too_short',
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore: null,
      finalScore: 0,
      analysisMode: config.analysisMode,
    };
  }

  // keyword_only: legacy hard gate
  if (config.analysisMode === 'keyword_only' && keywordScore < config.minScore) {
    await persistContentAnalysis(input.content.id, {
      filterStage: 'keyword_gate',
      analysisMode: config.analysisMode,
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore: null,
      finalScore: keywordScore,
      usedDefaultKeywords: config.usedDefaultKeywords,
      reasons: scored.reasons.concat([`Keyword ${keywordScore} < minScore ${config.minScore}`]),
    });
    return {
      findingCreated: false,
      notificationCreated: false,
      score: keywordScore,
      ignoredByRule: true,
      filterStage: 'keyword_gate',
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore: null,
      finalScore: keywordScore,
      analysisMode: config.analysisMode,
    };
  }

  const budget = input.analysisBudget ?? {
    used: 0,
    max: getLeadAnalysisLimits().maxPerJob,
  };

  const shouldRunAi = decideShouldRunAi({
    mode: config.analysisMode,
    keywordScore,
    softKeywordScore: config.softKeywordScore,
    prefilterPassed: prefilter.passed,
    deepAnalyze: config.deepAnalyze,
    budgetRemaining: budget.used < budget.max,
    skipAi: config.skipAi,
  });

  let aiScore: number | null = null;
  let analysisRan = false;
  let analysisReasons: string[] = [];
  let analysisSummary: string | null = null;
  let leadExtracted: Record<string, unknown> | null = null;
  let aiSource: 'ai' | 'fallback' | 'skipped' | 'budget' = 'skipped';

  if (!shouldRunAi.run && shouldRunAi.reason === 'budget') {
    // continue with keyword-only path below
    aiSource = 'budget';
  } else if (shouldRunAi.run) {
      const analysisOutput = await analyzeLeadContent(
      {
        title: input.title,
        bodyText: input.content.contentText,
        canonicalUrl: input.content.canonicalUrl,
        sourceType: input.source.type,
        positiveKeywords: config.positiveKeywords,
        negativeKeywords: config.negativeKeywords,
        // Bypass prefilter hard-block for ai_first/hybrid — keyword is no longer the AI gate.
        deepAnalyze:
          config.deepAnalyze ||
          config.analysisMode === 'ai_first' ||
          config.analysisMode === 'hybrid',
        prefilterMinScore: config.prefilterMinScore,
      },
      { skipAi: config.skipAi },
    );

    if (analysisOutput.ran && analysisOutput.analysis) {
      budget.used += 1;
      analysisRan = true;
      aiScore = analysisOutput.analysis.score;
      analysisReasons = analysisOutput.analysis.reasons || [];
      analysisSummary = analysisOutput.analysis.summary || null;
      leadExtracted = analysisOutput.extractedData;
      aiSource = analysisOutput.meta?.source === 'ai' ? 'ai' : 'fallback';
    } else if (!analysisOutput.ran) {
      analysisReasons = analysisOutput.prefilter.reasons;
      aiSource = 'skipped';
    }
  }

  const finalScore = computeFinalScore({
    keywordScore,
    aiScore,
    analysisMode: config.analysisMode,
  });

  // Create finding when final score clears threshold (AI or keyword).
  // ai_first / hybrid: keyword alone is NOT required.
  if (finalScore < config.minScore) {
    await persistContentAnalysis(input.content.id, {
      filterStage: 'low_final_score',
      analysisMode: config.analysisMode,
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore,
      finalScore,
      usedDefaultKeywords: config.usedDefaultKeywords,
      aiSource,
      reasons: [
        ...scored.reasons.slice(0, 5),
        ...prefilter.reasons.slice(0, 3),
        ...analysisReasons.slice(0, 5),
        `finalScore ${finalScore} < minScore ${config.minScore}`,
      ],
    });
    return {
      findingCreated: false,
      notificationCreated: false,
      score: finalScore,
      analysisRan,
      ignoredByRule: true,
      filterStage: 'low_final_score',
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore,
      finalScore,
      analysisMode: config.analysisMode,
    };
  }

  const findingType = 'lead_signal';
  const summary =
    analysisSummary ||
    input.content.contentText.slice(0, 500);

  const existingFinding = await prisma.agentFinding.findFirst({
    where: {
      scannedContentId: input.content.id,
      type: { in: [findingType, 'keyword_match'] },
    },
  });

  let findingId = existingFinding?.id;
  let findingCreated = false;

  const scoreBreakdown = {
    keywordScore,
    prefilterScore: prefilter.score,
    aiScore,
    finalScore,
    analysisMode: config.analysisMode,
    usedDefaultKeywords: config.usedDefaultKeywords,
    aiSource,
  };

  if (!existingFinding) {
    const finding = await prisma.agentFinding.create({
      data: {
        companyId: input.content.companyId,
        missionId: input.mission?.id ?? null,
        sourceId: input.source.id,
        scannedContentId: input.content.id,
        type: findingType,
        score: finalScore,
        title: input.title.slice(0, 200) || 'Tín hiệu lead',
        summary,
        extractedData: {
          canonicalUrl: input.content.canonicalUrl,
          matchedPositive: scored.matchedPositive.slice(0, 20),
          matchedNegative: scored.matchedNegative.slice(0, 20),
          scoreBreakdown,
          ...(leadExtracted ? { leadAnalysis: leadExtracted } : {}),
        } as Prisma.InputJsonValue,
        reasons: uniqueReasons([
          ...scored.reasons.slice(0, 8),
          ...prefilter.reasons.slice(0, 3),
          ...analysisReasons,
        ]) as Prisma.InputJsonValue,
        status: 'new',
      },
    });
    findingId = finding.id;
    findingCreated = true;
  } else {
    await prisma.agentFinding.update({
      where: { id: existingFinding.id },
      data: {
        score: Math.max(existingFinding.score, finalScore),
        summary,
        type: findingType,
        extractedData: {
          canonicalUrl: input.content.canonicalUrl,
          matchedPositive: scored.matchedPositive.slice(0, 20),
          matchedNegative: scored.matchedNegative.slice(0, 20),
          scoreBreakdown,
          ...(leadExtracted ? { leadAnalysis: leadExtracted } : {}),
        } as Prisma.InputJsonValue,
        reasons: uniqueReasons([
          ...scored.reasons.slice(0, 8),
          ...prefilter.reasons.slice(0, 3),
          ...analysisReasons,
        ]) as Prisma.InputJsonValue,
      },
    });
  }

  let notificationCreated = false;
  if (finalScore >= config.notifyScore && findingId) {
    const result = await notifyFindingHighScore({
      companyId: input.content.companyId,
      findingId,
      score: finalScore,
      title: input.title,
      canonicalUrl: input.content.canonicalUrl,
      sourceId: input.source.id,
    });
    notificationCreated = result.created;
  }

  await persistContentAnalysis(input.content.id, {
    filterStage: 'created_finding',
    analysisMode: config.analysisMode,
    keywordScore,
    prefilterScore: prefilter.score,
    aiScore,
    finalScore,
    usedDefaultKeywords: config.usedDefaultKeywords,
    aiSource,
    findingId: findingId ?? null,
    reasons: analysisReasons.slice(0, 5),
  });

  return {
    findingCreated,
    notificationCreated,
    score: finalScore,
    analysisRan,
    filterStage: 'created_finding',
    keywordScore,
    prefilterScore: prefilter.score,
    aiScore,
    finalScore,
    analysisMode: config.analysisMode,
  };
}

function decideShouldRunAi(input: {
  mode: LeadAnalysisConfig['analysisMode'];
  keywordScore: number;
  softKeywordScore: number;
  prefilterPassed: boolean;
  deepAnalyze: boolean;
  budgetRemaining: boolean;
  skipAi: boolean;
}): { run: boolean; reason: 'ok' | 'budget' | 'mode' | 'gate' } {
  if (!input.budgetRemaining) return { run: false, reason: 'budget' };
  // skipAi still "runs" analyzer with deterministic fallback
  if (input.mode === 'keyword_only') {
    // Enrich only when keyword already strong enough path continues
    return { run: true, reason: 'ok' };
  }
  if (input.mode === 'ai_first') {
    return { run: true, reason: 'ok' };
  }
  // hybrid: AI if soft keyword hit, prefilter pass, or deepAnalyze
  if (
    input.deepAnalyze ||
    input.prefilterPassed ||
    input.keywordScore >= input.softKeywordScore
  ) {
    return { run: true, reason: 'ok' };
  }
  // Still run AI when keywords came from defaults but soft score low —
  // body already passed length/spam gates; give AI a chance.
  return { run: true, reason: 'ok' };
}

async function persistContentAnalysis(
  contentId: string,
  analysis: Record<string, unknown>,
): Promise<void> {
  try {
    const existing = await prisma.scannedContent.findUnique({
      where: { id: contentId },
      select: { metrics: true, status: true },
    });
    const prev =
      existing?.metrics && typeof existing.metrics === 'object'
        ? (existing.metrics as Record<string, unknown>)
        : {};

    const filterStage = String(analysis.filterStage || '');
    const nextStatus =
      filterStage === 'created_finding'
        ? 'analyzed'
        : filterStage === 'hard_spam' ||
            filterStage === 'too_short' ||
            filterStage === 'keyword_gate' ||
            filterStage === 'low_final_score'
          ? 'ignored'
          : existing?.status || 'collected';

    await prisma.scannedContent.update({
      where: { id: contentId },
      data: {
        status: nextStatus,
        metrics: {
          ...prev,
          leadAnalysis: {
            ...analysis,
            analyzedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.warn(
      '[finding-rule] persistContentAnalysis failed:',
      error instanceof Error ? error.message : error,
    );
  }
}

function uniqueReasons(items: string[]): string[] {
  return [...new Set(items.map(item => item.trim()).filter(Boolean))];
}
