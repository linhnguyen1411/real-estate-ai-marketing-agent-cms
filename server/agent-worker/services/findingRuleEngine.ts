import type { AgentMission, AgentSource, ScannedContent } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import { analyzeLeadContent, getLeadAnalysisLimits } from '../../agent/leadAnalyzer';
import { parseWebsiteConfig } from './contentNormalizer';

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
}

export interface AnalysisBudget {
  used: number;
  max: number;
}

export function resolveRuleSet(
  source: AgentSource,
  mission: AgentMission | null,
): RuleSet {
  const sourceConfig = parseWebsiteConfig(source.config);
  const missionRules = (mission?.rules || {}) as Record<string, unknown>;

  const missionKeywords = toKeywordList(missionRules.keywords ?? missionRules.positiveKeywords);
  const missionNegative = toKeywordList(missionRules.negativeKeywords);

  const positiveKeywords = unique([
    ...sourceConfig.positiveKeywords ?? [],
    ...missionKeywords,
  ]);
  const negativeKeywords = unique([
    ...sourceConfig.negativeKeywords ?? [],
    ...missionNegative,
  ]);

  const minScore = clampScore(missionRules.minScore ?? sourceConfig.minScore, 50);
  const notifyScore = clampScore(missionRules.notifyScore ?? sourceConfig.notifyScore, 75);

  return { positiveKeywords, negativeKeywords, minScore, notifyScore };
}

export function scoreContent(
  title: string,
  bodyText: string,
  rules: RuleSet,
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

export async function processFindingForContent(input: {
  content: ScannedContent;
  source: AgentSource;
  mission: AgentMission | null;
  rules: RuleSet;
  title: string;
  analysisBudget?: AnalysisBudget;
}): Promise<FindingProcessResult> {
  const scored = scoreContent(input.title, input.content.contentText, input.rules);

  if (scored.score < input.rules.minScore) {
    return { findingCreated: false, notificationCreated: false, score: scored.score };
  }

  const summary = input.content.contentText.slice(0, 500);
  const findingType = 'keyword_match';

  const existingFinding = await prisma.agentFinding.findUnique({
    where: {
      scannedContentId_type: {
        scannedContentId: input.content.id,
        type: findingType,
      },
    },
  });

  let findingId = existingFinding?.id;
  let findingCreated = false;

  if (!existingFinding) {
    const finding = await prisma.agentFinding.create({
      data: {
        companyId: input.content.companyId,
        missionId: input.mission?.id ?? null,
        sourceId: input.source.id,
        scannedContentId: input.content.id,
        type: findingType,
        score: scored.score,
        title: input.title.slice(0, 200) || 'Nội dung phù hợp',
        summary,
        extractedData: {
          canonicalUrl: input.content.canonicalUrl,
          matchedPositive: scored.matchedPositive,
          matchedNegative: scored.matchedNegative,
        } as Prisma.InputJsonValue,
        reasons: scored.reasons as Prisma.InputJsonValue,
        status: 'new',
      },
    });
    findingId = finding.id;
    findingCreated = true;
  }

  let finalScore = scored.score;
  let finalSummary = summary;
  let analysisRan = false;

  if (findingId) {
    const limits = getLeadAnalysisLimits();
    const budget = input.analysisBudget ?? { used: 0, max: limits.maxPerJob };
    const canAnalyze = budget.used < budget.max;

    if (canAnalyze) {
      const missionRules = (input.mission?.rules || {}) as Record<string, unknown>;
      const sourceConfig = (input.source.config || {}) as Record<string, unknown>;
      const deepAnalyze = missionRules.deepAnalyze === true || sourceConfig.deepAnalyze === true;

      const analysisOutput = await analyzeLeadContent(
        {
          title: input.title,
          bodyText: input.content.contentText,
          canonicalUrl: input.content.canonicalUrl,
          sourceType: input.source.type,
          positiveKeywords: input.rules.positiveKeywords,
          negativeKeywords: input.rules.negativeKeywords,
          deepAnalyze,
          prefilterMinScore: Number(missionRules.prefilterMinScore ?? sourceConfig.prefilterMinScore) || undefined,
        },
        { skipAi: process.env.AGENT_LEAD_ANALYSIS_SKIP_AI === '1' },
      );

      if (analysisOutput.ran && analysisOutput.analysis && analysisOutput.extractedData) {
        budget.used += 1;
        analysisRan = true;
        finalScore = Math.max(finalScore, analysisOutput.analysis.score);
        finalSummary = analysisOutput.analysis.summary || finalSummary;

        await prisma.agentFinding.update({
          where: { id: findingId },
          data: {
            score: finalScore,
            summary: finalSummary,
            extractedData: {
              canonicalUrl: input.content.canonicalUrl,
              keywordMatch: {
                matchedPositive: scored.matchedPositive,
                matchedNegative: scored.matchedNegative,
              },
              leadAnalysis: analysisOutput.extractedData,
            } as Prisma.InputJsonValue,
            reasons: uniqueReasons([
              ...scored.reasons,
              ...analysisOutput.prefilter.reasons.slice(0, 3),
              ...analysisOutput.analysis.reasons,
            ]) as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  let notificationCreated = false;
  if (finalScore >= input.rules.notifyScore && findingId) {
    const eventKey = `finding:${findingId}`;
    try {
      await prisma.agentNotification.create({
        data: {
          companyId: input.content.companyId,
          findingId,
          type: 'finding_high_score',
          eventKey,
          title: `Finding mới — điểm ${finalScore}`,
          message: `${input.title} (${input.content.canonicalUrl})`,
          severity: finalScore >= 90 ? 'high' : 'info',
          status: 'unread',
          data: {
            score: finalScore,
            sourceId: input.source.id,
            scannedContentId: input.content.id,
          } as Prisma.InputJsonValue,
        },
      });
      notificationCreated = true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
  }

  return { findingCreated, notificationCreated, score: finalScore, analysisRan };
}

function uniqueReasons(items: string[]): string[] {
  return [...new Set(items.map(item => item.trim()).filter(Boolean))];
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
