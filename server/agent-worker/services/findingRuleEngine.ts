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
import { notifyFindingIfEligible } from '../../notifications/telegramNotificationService';
import { enqueueFindingUpsertSync, enqueueScannedContentSync, shouldEnqueueSync } from '../../agentSync/enqueue';
import { scheduleAgentSyncFlush } from '../../agentSync/outboxWorker';
import { isLocalSyncEnabled } from '../../agentSync/envelope';
import { runLeadPrefilter } from '../../agent/leadPrefilter';
import { extractLeadData, toRawExtracted, type DeterministicExtraction } from '../../agent/extractors';
import {
  actorRoleFromClassification,
  bigIntOrNull,
  computeIntelligenceFinalScore,
  computeLeadFitScore,
  computeRuleScore,
  INTELLIGENCE_VERSION,
  normalizeActorRole,
  normalizeClassification,
  normalizeIntent,
  priorityFromScore,
  type ActorRole,
  type LeadClassification,
} from '../../agent/leadIntelligence';
import { enqueueFindingEnrichment } from '../../agent/findingEnrichmentService';
import type { LeadAnalysisResult } from '../../agent/leadAnalysisSchema';
import { decideAiFindingGate } from '../../agent/findingAiGate';
import { isFindingAiGateEnabled } from '../../modules/ai-gateway/apiKeyResolver';
import {
  buildContentDedupeMeta,
  decideFindingDedupe,
} from '../../agent/dedup/findingDedupService';
import { matchPropertiesForLead } from '../../agent/propertyMatchingService';
import { detectSubjectDirection } from '../../agent/subjectDirection';
import {
  domainMatchesMission,
  evaluateRealEstateRelevance,
  type RealEstateRelevanceResult,
} from '../../agent/domainClassification';
import {
  textHasKeyword,
} from '../../agent/offTopicFilter';
import { evaluateContentSpam } from '../../agent/spam/spamPolicyService';
import type { SpamDecision } from '../../agent/spam/spamTypes';

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
  leadFitScore?: number;
  finalScore?: number;
  analysisMode?: string;
  classification?: string;
  outOfScope?: boolean;
  duplicate?: boolean;
  domainClassification?: string;
  outOfDomain?: boolean;
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
    const inTitle = textHasKeyword(haystackTitle, keyword);
    const inBody = textHasKeyword(haystackBody, keyword);
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
    if (textHasKeyword(haystackTitle, keyword) || textHasKeyword(haystackBody, keyword)) {
      matchedNegative.push(keyword);
      score -= 20;
      reasons.push(`-20 từ khóa loại trừ "${keyword}"`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, reasons, matchedPositive, matchedNegative };
}

/** Legacy blend — kept for tests; production uses computeIntelligenceFinalScore. */
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
    return Math.max(aiScore, Math.round(aiScore * 0.7 + keywordScore * 0.3));
  }
  return Math.max(keywordScore, aiScore, Math.round(keywordScore * 0.4 + aiScore * 0.6));
}

export async function processFindingForContent(input: {
  content: ScannedContent;
  source: AgentSource;
  mission: AgentMission | null;
  rules?: RuleSet;
  title: string;
  analysisBudget?: AnalysisBudget;
  workflow?: {
    missionRunId?: string;
    deferNotify?: boolean;
    deferTelegram?: boolean;
    deferMatching?: boolean;
  };
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
  const deterministic = extractLeadData(input.content.contentText);
  const combinedText = `${input.title}\n${input.content.contentText}`;
  const relevance = evaluateRealEstateRelevance(combinedText);

  // Persist content-level dedupe meta early
  await persistContentDedupeMeta(input.content.id, input.content.contentText, input.title);

  // Domain gate BEFORE keyword scoring boosts / AI / phone fit score
  if (config.domain === 'real_estate') {
    if (relevance.decision === 'reject') {
      await persistContentAnalysis(input.content.id, {
        filterStage: 'out_of_domain',
        analysisMode: config.analysisMode,
        keywordScore: 0,
        prefilterScore: 0,
        aiScore: null,
        leadFitScore: 0,
        finalScore: 0,
        scoreStatus: 'out_of_domain',
        decision: 'out_of_domain',
        reasonCode: relevance.reasonCode,
        domain: relevance.domain,
        transactionObject: relevance.domain.transactionObject,
        relevanceScore: relevance.relevanceScore,
        usedDefaultKeywords: config.usedDefaultKeywords,
        reasons: [
          `domain=${relevance.domain.classification}`,
          `object=${relevance.domain.transactionObject.normalizedType}`,
          relevance.reasonCode,
        ],
      }, {
        rawAnalysis: {
          decision: 'out_of_domain',
          reasonCode: relevance.reasonCode,
          domain: relevance.domain,
        },
      });
      await softDismissOutOfDomainFindings(input.content.id, relevance);
      return {
        findingCreated: false,
        notificationCreated: false,
        score: 0,
        ignoredByRule: true,
        outOfDomain: true,
        filterStage: 'out_of_domain',
        keywordScore: 0,
        leadFitScore: 0,
        finalScore: 0,
        analysisMode: config.analysisMode,
        domainClassification: relevance.domain.classification,
      };
    }

    if (relevance.decision === 'needs_review') {
      await persistContentAnalysis(input.content.id, {
        filterStage: 'domain_needs_review',
        analysisMode: config.analysisMode,
        keywordScore: 0,
        aiScore: null,
        leadFitScore: 0,
        finalScore: 0,
        scoreStatus: 'domain_needs_review',
        decision: 'needs_review',
        reasonCode: relevance.reasonCode,
        domain: relevance.domain,
        transactionObject: relevance.domain.transactionObject,
        usedDefaultKeywords: config.usedDefaultKeywords,
        reasons: [`domain_needs_review:${relevance.reasonCode}`],
      });
      return {
        findingCreated: false,
        notificationCreated: false,
        score: 0,
        ignoredByRule: true,
        filterStage: 'domain_needs_review',
        keywordScore: 0,
        leadFitScore: 0,
        finalScore: 0,
        analysisMode: config.analysisMode,
        domainClassification: relevance.domain.classification,
      };
    }

    if (!domainMatchesMission(relevance.domain.classification, config.domain)) {
      await persistContentAnalysis(input.content.id, {
        filterStage: 'out_of_domain',
        analysisMode: config.analysisMode,
        keywordScore: 0,
        leadFitScore: 0,
        finalScore: 0,
        scoreStatus: 'out_of_domain',
        decision: 'out_of_domain',
        reasonCode: 'mission_domain_mismatch',
        domain: relevance.domain,
        reasons: [`mission_domain=${config.domain}`, `analysis_domain=${relevance.domain.classification}`],
      });
      await softDismissOutOfDomainFindings(input.content.id, relevance);
      return {
        findingCreated: false,
        notificationCreated: false,
        score: 0,
        ignoredByRule: true,
        outOfDomain: true,
        filterStage: 'out_of_domain',
        keywordScore: 0,
        leadFitScore: 0,
        finalScore: 0,
        analysisMode: config.analysisMode,
        domainClassification: relevance.domain.classification,
      };
    }
  }

  const prefilter = runLeadPrefilter({
    title: input.title,
    bodyText: input.content.contentText,
    positiveKeywords: config.positiveKeywords,
    negativeKeywords: config.negativeKeywords,
    prefilterMinScore: config.prefilterMinScore,
    minBodyLength: config.minBodyLength,
  });

  if (prefilter.outOfDomain || (prefilter.isHardSpam && prefilter.relevance?.decision === 'reject')) {
    await persistContentAnalysis(input.content.id, {
      filterStage: 'out_of_domain',
      analysisMode: config.analysisMode,
      keywordScore: 0,
      prefilterScore: prefilter.score,
      aiScore: null,
      leadFitScore: 0,
      finalScore: 0,
      scoreStatus: 'out_of_domain',
      decision: 'out_of_domain',
      reasonCode: prefilter.relevance?.reasonCode || 'prefilter_out_of_domain',
      domain: prefilter.relevance?.domain,
      usedDefaultKeywords: config.usedDefaultKeywords,
      reasons: prefilter.reasons,
    }, {
      rawAnalysis: {
        decision: 'out_of_domain',
        reasonCode: prefilter.relevance?.reasonCode || 'prefilter_out_of_domain',
        domain: prefilter.relevance?.domain,
      },
    });
    await softDismissOutOfDomainFindings(input.content.id, prefilter.relevance || relevance);
    return {
      findingCreated: false,
      notificationCreated: false,
      score: 0,
      ignoredByRule: true,
      outOfDomain: true,
      filterStage: 'out_of_domain',
      keywordScore: 0,
      prefilterScore: prefilter.score,
      leadFitScore: 0,
      finalScore: 0,
      analysisMode: config.analysisMode,
      domainClassification: (prefilter.relevance || relevance).domain.classification,
    };
  }

  if (prefilter.domainNeedsReview) {
    await persistContentAnalysis(input.content.id, {
      filterStage: 'domain_needs_review',
      analysisMode: config.analysisMode,
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore: null,
      leadFitScore: 0,
      finalScore: 0,
      reasons: prefilter.reasons,
      domain: prefilter.relevance?.domain,
    });
    return {
      findingCreated: false,
      notificationCreated: false,
      score: 0,
      ignoredByRule: true,
      filterStage: 'domain_needs_review',
      keywordScore,
      prefilterScore: prefilter.score,
      analysisMode: config.analysisMode,
    };
  }

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
    return emptyResult({
      filterStage: 'hard_spam',
      keywordScore,
      prefilterScore: prefilter.score,
      analysisMode: config.analysisMode,
    });
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
    return emptyResult({
      filterStage: 'too_short',
      keywordScore,
      prefilterScore: prefilter.score,
      analysisMode: config.analysisMode,
    });
  }

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
    return emptyResult({
      filterStage: 'keyword_gate',
      keywordScore,
      prefilterScore: prefilter.score,
      finalScore: keywordScore,
      analysisMode: config.analysisMode,
      score: keywordScore,
    });
  }

  // Tier-1 spam policy (pre-AI): phone / profile / source / phrase / hash
  const preAiSpam = await evaluateContentSpam({
    contentText: `${input.title}\n${input.content.contentText}`,
    authorName: input.content.authorName,
    authorUrl: input.content.authorUrl,
    pageUrl: input.content.canonicalUrl,
    canonicalUrl: input.content.canonicalUrl,
    contentHash: input.content.contentHash,
    normalizedContentHash: input.content.normalizedContentHash,
    phones: deterministic.phone.phones?.map(p => ({
      raw: p.raw,
      normalized: p.normalized,
      e164: p.e164,
    })),
    sourceId: input.source.id,
    companyId: input.content.companyId || input.source.companyId,
    tier: 'pre_ai',
  });

  if (preAiSpam.decision.hardGate) {
    return applySpamHardGate({
      contentId: input.content.id,
      decision: preAiSpam.decision,
      config,
      keywordScore,
      prefilterScore: prefilter.score,
    });
  }

  const spamScorePenalty = preAiSpam.decision.decision === 'lower_score'
    ? preAiSpam.decision.scorePenalty
    : 0;

  // Keyword already screened above. Prefer AI gate before creating a finding;
  // keyword/subjectDirection only when AI fails / disabled / keyword_only.
  let analysisRan = false;
  let aiScore: number | null = null;
  let analysis: LeadAnalysisResult | null = null;
  let leadExtracted: Record<string, unknown> | null = null;
  let aiSource: 'ai' | 'fallback' | 'skipped' | 'budget' = 'skipped';
  let aiGateAccepted = false;
  const budget = input.analysisBudget ?? {
    used: 0,
    max: getLeadAnalysisLimits().maxPerJob,
  };

  const gateOn =
    isFindingAiGateEnabled() &&
    !config.skipAi &&
    config.analysisMode !== 'keyword_only';

  if (gateOn && budget.used < budget.max) {
    try {
      const aiOut = await analyzeLeadContent(
        {
          title: input.title,
          bodyText: input.content.contentText,
          canonicalUrl: input.content.canonicalUrl || '',
          sourceType: input.source.type,
          positiveKeywords: config.positiveKeywords,
          negativeKeywords: config.negativeKeywords,
          deepAnalyze: true,
          prefilterMinScore: config.prefilterMinScore,
        },
        {
          preferredProviders: ['gemini', 'openai', 'ollama'],
          timeoutMs: Math.min(getLeadAnalysisLimits().timeoutMs, 25_000),
        },
      );
      budget.used += 1;

      if (aiOut.meta?.source === 'ai' && aiOut.analysis) {
        analysisRan = true;
        analysis = aiOut.analysis;
        aiScore = analysis.score;
        leadExtracted = aiOut.extractedData;
        aiSource = 'ai';

        const gate = decideAiFindingGate(analysis, config.targetClassifications);
        if (gate.accept === false) {
          await persistContentAnalysis(input.content.id, {
            filterStage: 'out_of_scope',
            analysisMode: config.analysisMode,
            keywordScore,
            prefilterScore: prefilter.score,
            aiScore,
            leadFitScore: 0,
            finalScore: 0,
            classification: analysis.classification,
            intent: analysis.intent,
            actorRole: analysis.actorRole,
            usedDefaultKeywords: config.usedDefaultKeywords,
            aiSource,
            pipeline: 'keyword_then_ai_gate',
            reasons: [
              gate.rejectReason,
              `ai_classification=${analysis.classification}`,
              `ai_actorRole=${analysis.actorRole}`,
              ...(analysis.reasons || []).slice(0, 4),
            ],
            ...(leadExtracted ? { leadAnalysis: leadExtracted } : {}),
          });
          return {
            findingCreated: false,
            notificationCreated: false,
            score: 0,
            analysisRan: true,
            ignoredByRule: false,
            outOfScope: true,
            filterStage: 'out_of_scope',
            keywordScore,
            prefilterScore: prefilter.score,
            aiScore,
            leadFitScore: 0,
            finalScore: 0,
            analysisMode: config.analysisMode,
            classification: analysis.classification,
          };
        }
        aiGateAccepted = true;
      } else {
        aiSource = aiOut.meta?.source === 'fallback' ? 'fallback' : 'skipped';
        console.warn(
          `[findingRuleEngine] AI gate unavailable — keyword fallback (content=${input.content.id})`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[findingRuleEngine] AI gate error — keyword fallback: ${msg.slice(0, 200)}`);
      aiSource = 'fallback';
    }
  } else if (gateOn && budget.used >= budget.max) {
    aiSource = 'budget';
  }

  void decideShouldRunAi;

  // Resolve classification: AI gate result, else subject-direction + extractors
  const direction = detectSubjectDirection(`${input.title}\n${input.content.contentText}`);
  let classification = aiGateAccepted && analysis
    ? normalizeClassification(analysis.classification)
    : resolveClassification(null, deterministic);
  if (!aiGateAccepted && direction.classification !== 'unknown') {
    classification = direction.classification;
  }

  const intent = normalizeIntent(
    (aiGateAccepted && analysis?.intent) || direction.intent || deterministic.property.intent,
  );
  let actorRole: ActorRole =
    aiGateAccepted && analysis
      ? normalizeActorRole(analysis.actorRole)
      : direction.actorRole !== 'unknown'
        ? direction.actorRole
        : actorRoleFromClassification(classification);
  if (actorRole === 'unknown') actorRole = actorRoleFromClassification(classification);

  const representedDemand =
    (aiGateAccepted && analysis?.representedDemand) || direction.representedDemand;
  const brokerActivity =
    (aiGateAccepted && analysis?.brokerActivity) || direction.brokerActivity;

  // Tier-2 spam policy (post-classification): classification / actor_role rules
  const postClassSpam = await evaluateContentSpam({
    contentText: `${input.title}\n${input.content.contentText}`,
    authorName: input.content.authorName,
    authorUrl: input.content.authorUrl,
    canonicalUrl: input.content.canonicalUrl,
    contentHash: input.content.contentHash,
    normalizedContentHash: input.content.normalizedContentHash,
    phones: deterministic.phone.phones?.map(p => ({
      raw: p.raw,
      normalized: p.normalized,
      e164: p.e164,
    })),
    sourceId: input.source.id,
    companyId: input.content.companyId || input.source.companyId,
    classification,
    actorRole,
    tier: 'post_class',
  });

  if (postClassSpam.decision.hardGate) {
    return applySpamHardGate({
      contentId: input.content.id,
      decision: postClassSpam.decision,
      config,
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore,
      analysisRan,
      classification,
    });
  }

  const totalSpamPenalty =
    spamScorePenalty +
    (postClassSpam.decision.decision === 'lower_score' ? postClassSpam.decision.scorePenalty : 0);

  const targetMatched = config.targetClassifications.includes(classification);
  const isBrokerDemand =
    !aiGateAccepted &&
    classification === 'broker' &&
    (brokerActivity === 'demand_request' ||
      representedDemand === 'buyer' ||
      representedDemand === 'renter' ||
      representedDemand === 'investor');
  const isClearSupplyDismiss =
    classification === 'spam' ||
    (classification === 'seller' && actorRole === 'supply_side') ||
    (classification === 'landlord' && actorRole === 'supply_side') ||
    (classification === 'broker' &&
      (brokerActivity === 'supply_listing' || brokerActivity === 'recruitment'));

  // Soft keywords alone must NOT invent buyer intent — default packs include
  // property/location/seller terms that light up listing posts.
  const hasBuyerIntent =
    aiGateAccepted ||
    actorRole === 'demand_side' ||
    targetMatched ||
    isBrokerDemand ||
    (direction.demandSignals.length > 0 &&
      direction.demandSignals.length >= direction.supplySignals.length &&
      !isClearSupplyDismiss) ||
    (keywordScore >= config.softKeywordScore &&
      direction.demandSignals.length > 0 &&
      !isClearSupplyDismiss &&
      classification !== 'seller' &&
      classification !== 'landlord' &&
      classification !== 'unknown');

  // "Cần xem lại" = ambiguous demand∩supply or broker demand — NOT every
  // unclassified listing (those are usually sellers missing strong verbs).
  const isAmbiguousUnknown =
    !aiGateAccepted &&
    classification === 'unknown' &&
    direction.demandSignals.length > 0 &&
    direction.supplySignals.length > 0;

  const needsReview =
    !aiGateAccepted &&
    (isAmbiguousUnknown ||
      isBrokerDemand ||
      (!targetMatched &&
        !isClearSupplyDismiss &&
        hasBuyerIntent &&
        classification !== 'unknown'));

  const hasPhone = Boolean(
    analysis?.contact?.phone || deterministic.phone.primaryPhone,
  );
  const hasBudget = Boolean(
    analysis?.budgetMin != null ||
      analysis?.budgetMax != null ||
      deterministic.money.budgetMin != null ||
      deterministic.money.budgetMax != null,
  );
  const hasLocation = Boolean(
    analysis?.region || deterministic.location.primaryLocation,
  );
  const propertyTypes =
    (analysis?.propertyTypes?.length ? analysis.propertyTypes : null) ||
    deterministic.property.propertyTypes ||
    [];
  const hasPropertyType = propertyTypes.length > 0;

  const leadFitScore = computeLeadFitScore({
    classification,
    actorRole,
    targetClassifications: config.targetClassifications as LeadClassification[],
    hasPhone,
    hasBudget,
    hasLocation,
    hasPropertyType,
    urgency: analysis?.urgency ?? null,
  });

  const ruleScore = computeRuleScore({
    keywordScore,
    leadFitScore,
    demandSignalCount: direction.demandSignals.length,
    hasPhone,
  });

  const finalScore = Math.max(
    0,
    computeIntelligenceFinalScore({
      leadFitScore: Math.max(leadFitScore, hasBuyerIntent ? 40 : 0),
      aiScore,
      keywordScore,
      targetMatched: hasBuyerIntent || (targetMatched && actorRole === 'demand_side'),
      ruleScore: hasBuyerIntent ? Math.max(ruleScore, 35) : ruleScore,
    }) - totalSpamPenalty,
  );

  const analysisReasons = [
    aiGateAccepted
      ? 'pipeline:keyword_then_ai_gate'
      : aiSource === 'fallback' || aiSource === 'budget'
        ? 'pipeline:keyword_fallback_after_ai'
        : 'pipeline:keyword_rules',
    ...direction.demandSignals.slice(0, 3).map(s => `demand:${s}`),
  ];

  // Persist analysis; only auto-dismiss clear supply — never unknown / broker demand
  if (isClearSupplyDismiss && !hasBuyerIntent) {
    await persistContentAnalysis(input.content.id, {
      filterStage: 'out_of_scope',
      analysisMode: config.analysisMode,
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore,
      leadFitScore,
      finalScore: 0,
      classification,
      intent,
      actorRole,
      representedDemand,
      brokerActivity,
      demandSignals: direction.demandSignals,
      supplySignals: direction.supplySignals,
      needsReview: false,
      usedDefaultKeywords: config.usedDefaultKeywords,
      aiSource,
      targetClassifications: config.targetClassifications,
      reasons: [
        `classification=${classification}`,
        `actorRole=${actorRole}`,
        `brokerActivity=${brokerActivity}`,
        'clear_supply_dismiss',
        ...analysisReasons.slice(0, 5),
      ],
      ...(leadExtracted ? { leadAnalysis: leadExtracted } : {}),
    });
    await softDismissOutOfScopeFindings(input.content.id, classification, {
      brokerActivity,
      representedDemand,
    });
    return {
      findingCreated: false,
      notificationCreated: false,
      score: 0,
      analysisRan,
      ignoredByRule: false,
      outOfScope: true,
      filterStage: 'out_of_scope',
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore,
      leadFitScore,
      finalScore: 0,
      analysisMode: config.analysisMode,
      classification,
    };
  }

  // Non-target without review/buyer signal → out of scope (no finding)
  if (!targetMatched && !needsReview && !isBrokerDemand && !hasBuyerIntent) {
    await persistContentAnalysis(input.content.id, {
      filterStage: 'out_of_scope',
      analysisMode: config.analysisMode,
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore,
      leadFitScore,
      finalScore: 0,
      classification,
      intent,
      actorRole,
      representedDemand,
      brokerActivity,
      needsReview: false,
      usedDefaultKeywords: config.usedDefaultKeywords,
      aiSource,
      targetClassifications: config.targetClassifications,
      reasons: [
        `classification=${classification}`,
        `actorRole=${actorRole}`,
        'not_in_target_classifications',
        ...analysisReasons.slice(0, 5),
      ],
      ...(leadExtracted ? { leadAnalysis: leadExtracted } : {}),
    });
    return {
      findingCreated: false,
      notificationCreated: false,
      score: 0,
      analysisRan,
      ignoredByRule: false,
      outOfScope: true,
      filterStage: 'out_of_scope',
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore,
      leadFitScore,
      finalScore: 0,
      analysisMode: config.analysisMode,
      classification,
    };
  }

  // Buyer intent → ALWAYS create RAW finding (AI enrich async). Soft gate otherwise.
  const scoreGate = hasBuyerIntent
    ? 1
    : needsReview || isBrokerDemand
      ? Math.min(config.minScore, 25)
      : config.minScore;

  if (!hasBuyerIntent && finalScore < scoreGate) {
    await persistContentAnalysis(input.content.id, {
      filterStage: 'low_final_score',
      analysisMode: config.analysisMode,
      keywordScore,
      prefilterScore: prefilter.score,
      aiScore,
      leadFitScore,
      finalScore,
      classification,
      intent,
      actorRole,
      needsReview,
      usedDefaultKeywords: config.usedDefaultKeywords,
      aiSource,
      reasons: [
        ...scored.reasons.slice(0, 5),
        ...analysisReasons.slice(0, 5),
        `finalScore ${finalScore} < scoreGate ${scoreGate}`,
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
      leadFitScore,
      finalScore,
      analysisMode: config.analysisMode,
      classification,
    };
  }

  const findingType = 'lead_signal';
  const priority = priorityFromScore(finalScore, hasPhone);
  const primaryPhone =
    analysis?.contact?.phone || deterministic.phone.primaryPhone || null;
  const primaryLocation =
    analysis?.region || deterministic.location.primaryLocation || null;
  const budgetMin = bigIntOrNull(analysis?.budgetMin ?? deterministic.money.budgetMin);
  const budgetMax = bigIntOrNull(analysis?.budgetMax ?? deterministic.money.budgetMax);
  const askingPrice = bigIntOrNull(deterministic.money.askingPrice);
  const propertyType = propertyTypes[0] || null;

  const title =
    (analysis?.title || '').trim().slice(0, 90) ||
    buildFallbackTitle(classification, primaryLocation, budgetMin, budgetMax);
  const summary =
    (analysis?.summary || '').trim().slice(0, 600) ||
    `Lead ${classification}: ${input.content.contentText.slice(0, 180)}`;

  const matching = input.workflow?.deferMatching
    ? { items: [], missingReason: 'deferred_to_workflow_step' as const }
    : await matchPropertiesForLead({
        companyId: input.content.companyId,
        classification,
        budgetMin: budgetMin != null ? Number(budgetMin) : null,
        budgetMax: budgetMax != null ? Number(budgetMax) : null,
        location: primaryLocation,
        propertyTypes,
        purpose: intent,
      });

  const existingFinding = await prisma.agentFinding.findFirst({
    where: {
      scannedContentId: input.content.id,
      type: { in: [findingType, 'keyword_match'] },
    },
  });

  // Skip re-promoting dismissed findings on re-scan
  if (existingFinding?.status === 'dismissed') {
    await persistContentAnalysis(input.content.id, {
      filterStage: 'ignored_by_rule',
      analysisMode: config.analysisMode,
      keywordScore,
      aiScore,
      leadFitScore,
      finalScore,
      classification,
      findingId: existingFinding.id,
      reasons: ['Finding đã dismissed — không tái tạo'],
    });
    return {
      findingCreated: false,
      notificationCreated: false,
      score: finalScore,
      analysisRan,
      ignoredByRule: true,
      filterStage: 'ignored_by_rule',
      keywordScore,
      aiScore,
      leadFitScore,
      finalScore,
      analysisMode: config.analysisMode,
      classification,
    };
  }

  const dedupe = await decideFindingDedupe({
    companyId: input.content.companyId,
    sourceId: input.source.id,
    scannedContentId: input.content.id,
    contentText: input.content.contentText,
    authorName: input.content.authorName,
    title: input.title,
    excludeFindingId: existingFinding?.id,
  });

  const intelligencePayload = buildIntelligenceExtractedData({
    classification,
    intent,
    actorRole,
    confidence: analysis?.confidence ?? null,
    keywordScore,
    aiScore,
    leadFitScore,
    finalScore,
    urgency: analysis?.urgency || null,
    priority,
    deterministic,
    analysis,
    scored,
    content: input.content,
    source: input.source,
    matching,
    aiSource,
    dedupe,
  });

  let findingId = existingFinding?.id;
  let findingCreated = false;

  const columnData = {
    score: finalScore,
    title,
    summary,
    classification,
    intent,
    actorRole,
    priority,
    confidence: analysis?.confidence ?? null,
    keywordScore,
    aiScore,
    leadFitScore,
    finalScore,
    primaryPhone,
    primaryLocation,
    budgetMin,
    budgetMax,
    askingPrice,
    propertyType,
    dedupeStatus: dedupe.status,
    duplicateOfFindingId: dedupe.duplicateOfFindingId,
    similarityScore: dedupe.similarityScore,
    dedupeReason: dedupe.reason,
    intelligenceVersion: INTELLIGENCE_VERSION,
    extractedData: intelligencePayload as Prisma.InputJsonValue,
    reasons: uniqueReasons([
      ...scored.reasons.slice(0, 6),
      ...analysisReasons,
      dedupe.reason ? `dedupe:${dedupe.reason}` : '',
    ]) as Prisma.InputJsonValue,
  };

  if (!existingFinding) {
    const contentRow = await ensureScannedContentRow(input.content);
    try {
      const finding = await prisma.agentFinding.create({
        data: {
          companyId: contentRow.companyId,
          missionId: input.mission?.id ?? null,
          missionRunId: input.workflow?.missionRunId ?? null,
          sourceId: input.source.id,
          scannedContentId: contentRow.id,
          type: findingType,
          status: aiGateAccepted ? 'enriched' : 'raw',
          scoreStatus: aiGateAccepted ? 'enriched' : 'raw',
          ...columnData,
        },
      });
      findingId = finding.id;
      findingCreated = true;
      // Decision / Lead Acquisition still run async; AI re-call skipped when already enriched.
      enqueueFindingEnrichment(finding.id);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'P2003') {
        console.warn(
          `[findingRuleEngine] skip finding create — scanned content missing (${contentRow.id})`,
        );
        return {
          findingCreated: false,
          notificationCreated: false,
          score: finalScore,
          analysisRan,
          keywordScore,
          leadFitScore,
          finalScore,
          analysisMode: config.analysisMode,
          classification,
        };
      }
      throw error;
    }
  } else {
    await prisma.agentFinding.update({
      where: { id: existingFinding.id },
      data: {
        type: findingType,
        ...columnData,
        score: Math.max(existingFinding.score, finalScore),
        finalScore: Math.max(existingFinding.finalScore ?? 0, finalScore),
        status:
          existingFinding.status === 'dismissed' ||
          existingFinding.status === 'enriched' ||
          existingFinding.status === 'enriching'
            ? existingFinding.status
            : 'raw',
        scoreStatus:
          existingFinding.scoreStatus === 'enriched' || existingFinding.scoreStatus === 'enriching'
            ? existingFinding.scoreStatus
            : 'raw',
      },
    });
    if (
      existingFinding.status === 'raw' ||
      existingFinding.status === 'new' ||
      existingFinding.status === 'failed_enrichment' ||
      !existingFinding.aiScore
    ) {
      enqueueFindingEnrichment(existingFinding.id);
    }
  }

  let notificationCreated = false;
  const isDuplicateHidden = dedupe.status === 'duplicate';
  if (
    !input.workflow?.deferNotify &&
    finalScore >= config.notifyScore &&
    findingId &&
    !isDuplicateHidden &&
    findingCreated
  ) {
    const result = await notifyFindingHighScore({
      companyId: input.content.companyId,
      findingId,
      score: finalScore,
      title,
      canonicalUrl: input.content.canonicalUrl,
      sourceId: input.source.id,
    });
    notificationCreated = result.created;
  }

  // Non-blocking Telegram + VPS outbox after new/updated finding
  if (findingId && !isDuplicateHidden) {
    // When local→VPS sync is on, Telegram is owned by VPS after ingest.
    if (
      !input.workflow?.deferTelegram &&
      !(isLocalSyncEnabled() && shouldEnqueueSync())
    ) {
      void notifyFindingIfEligible({ findingId }).catch(() => undefined);
    }
    if (findingCreated || existingFinding) {
      void enqueueFindingUpsertSync({ findingId })
        .then((r) => {
          if (r.enqueued) scheduleAgentSyncFlush();
        })
        .catch(() => undefined);
    }
  }

  await persistContentAnalysis(input.content.id, {
    filterStage: isDuplicateHidden ? 'duplicate' : 'created_finding',
    analysisMode: config.analysisMode,
    keywordScore,
    prefilterScore: prefilter.score,
    aiScore,
    leadFitScore,
    finalScore,
    classification,
    intent,
    actorRole,
    usedDefaultKeywords: config.usedDefaultKeywords,
    aiSource,
    findingId: findingId ?? null,
    dedupeStatus: dedupe.status,
    reasons: analysisReasons.slice(0, 5),
  });

  return {
    findingCreated,
    notificationCreated,
    score: finalScore,
    analysisRan,
    duplicate: isDuplicateHidden,
    filterStage: isDuplicateHidden ? 'duplicate' : 'created_finding',
    keywordScore,
    prefilterScore: prefilter.score,
    aiScore,
    leadFitScore,
    finalScore,
    analysisMode: config.analysisMode,
    classification,
  };
}

function emptyResult(partial: Partial<FindingProcessResult> & { filterStage: AnalysisFilterStage }): FindingProcessResult {
  return {
    findingCreated: false,
    notificationCreated: false,
    score: partial.score ?? 0,
    ignoredByRule: true,
    filterStage: partial.filterStage,
    keywordScore: partial.keywordScore,
    prefilterScore: partial.prefilterScore,
    aiScore: partial.aiScore ?? null,
    finalScore: partial.finalScore ?? 0,
    analysisMode: partial.analysisMode,
  };
}

async function applySpamHardGate(opts: {
  contentId: string;
  decision: SpamDecision;
  config: LeadAnalysisConfig;
  keywordScore: number;
  prefilterScore?: number;
  aiScore?: number | null;
  analysisRan?: boolean;
  classification?: string;
}): Promise<FindingProcessResult> {
  const isBlock = opts.decision.decision === 'block';
  const filterStage: AnalysisFilterStage = isBlock ? 'blocked' : 'spam_ignored';
  const matchedRuleIds = opts.decision.matchedRules.map(m => m.ruleId);
  await persistContentAnalysis(opts.contentId, {
    filterStage,
    analysisMode: opts.config.analysisMode,
    keywordScore: opts.keywordScore,
    prefilterScore: opts.prefilterScore ?? null,
    aiScore: opts.aiScore ?? null,
    leadFitScore: 0,
    finalScore: 0,
    scoreStatus: isBlock ? 'blocked' : 'ignored',
    decision: opts.decision.decision,
    reasonCode: opts.decision.primaryReason,
    usedDefaultKeywords: opts.config.usedDefaultKeywords,
    classification: opts.classification,
    spamDecision: opts.decision.decision,
    spamReason: opts.decision.primaryReason,
    matchedSpamRuleIds: matchedRuleIds,
    spamExplanations: opts.decision.explanations,
    blockedAt: new Date().toISOString(),
    blockedByRuleVersion: opts.decision.version,
    reasons: [
      `spam_${opts.decision.decision}`,
      opts.decision.primaryReason || '',
      ...opts.decision.explanations.slice(0, 5),
    ].filter(Boolean),
  });
  return {
    ...emptyResult({
      filterStage,
      keywordScore: opts.keywordScore,
      prefilterScore: opts.prefilterScore,
      aiScore: opts.aiScore ?? null,
      analysisMode: opts.config.analysisMode,
      score: 0,
      finalScore: 0,
    }),
    analysisRan: opts.analysisRan,
    classification: opts.classification,
  };
}

function resolveClassification(
  analysis: LeadAnalysisResult | null,
  deterministic: DeterministicExtraction,
): LeadClassification {
  const fromAi = analysis?.classification
    ? normalizeClassification(analysis.classification)
    : null;
  const fromDet = normalizeClassification(deterministic.property.classification);
  if (fromAi && fromAi !== 'unknown') return fromAi;
  if (fromDet !== 'unknown') return fromDet;
  return fromAi || 'unknown';
}

function buildFallbackTitle(
  classification: string,
  location: string | null,
  budgetMin: bigint | null,
  budgetMax: bigint | null,
): string {
  const loc = location ? ` tại ${location}` : '';
  const budget =
    budgetMin || budgetMax
      ? `, ngân sách ${formatMoneyShort(budgetMin || budgetMax)}`
      : '';
  if (classification === 'buyer') return `Khách tìm mua${loc}${budget}`.slice(0, 90);
  if (classification === 'renter') return `Khách tìm thuê${loc}`.slice(0, 90);
  if (classification === 'investor') return `Nhà đầu tư${loc}${budget}`.slice(0, 90);
  return `Lead ${classification}${loc}`.slice(0, 90);
}

function formatMoneyShort(value: bigint | null): string {
  if (value == null) return '';
  const n = Number(value);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} triệu`;
  return String(n);
}

function buildIntelligenceExtractedData(input: {
  classification: string;
  intent: string;
  actorRole: string;
  confidence: number | null;
  keywordScore: number;
  aiScore: number | null;
  leadFitScore: number;
  finalScore: number;
  urgency: string | null;
  priority: string;
  deterministic: DeterministicExtraction;
  analysis: LeadAnalysisResult | null;
  scored: ScoreResult;
  content: ScannedContent;
  source: AgentSource;
  matching: Awaited<ReturnType<typeof matchPropertiesForLead>>;
  aiSource: string;
  dedupe: Awaited<ReturnType<typeof decideFindingDedupe>>;
}): Record<string, unknown> {
  const d = input.deterministic;
  const raw = toRawExtracted(d);
  const a = input.analysis;

  return {
    classification: input.classification,
    intent: input.intent,
    actorRole: input.actorRole,
    confidence: input.confidence,
    keywordScore: input.keywordScore,
    aiScore: input.aiScore,
    leadFitScore: input.leadFitScore,
    finalScore: input.finalScore,
    urgency: input.urgency,
    contact: {
      phones: raw.phones || [],
      primaryPhone: a?.contact?.phone || raw.primaryPhone || null,
      emails: a?.contact?.email ? [a.contact.email] : [],
      facebookAuthorUrl: input.content.authorUrl || a?.contact?.facebookUrl || null,
    },
    money: {
      buyerBudgetMin: a?.budgetMin ?? raw.budgetMin ?? null,
      buyerBudgetMax: a?.budgetMax ?? raw.budgetMax ?? null,
      askingPriceMin: raw.askingPrice ?? null,
      askingPriceMax: null,
      rentPrice: raw.rentPrice ?? null,
      period: null,
      rawMentions: raw.money || [],
    },
    location: {
      city: (raw.location as { city?: string | null } | undefined)?.city ?? null,
      district: (raw.location as { district?: string | null } | undefined)?.district ?? null,
      ward: (raw.location as { ward?: string | null } | undefined)?.ward ?? null,
      street: (raw.location as { street?: string | null } | undefined)?.street ?? null,
      project: null,
      normalizedLocations: a?.region
        ? [a.region]
        : (raw.location as { normalized?: string[] } | undefined)?.normalized || [],
      rawMentions: (raw.location as { raw?: string[] } | undefined)?.raw || [],
    },
    property: {
      propertyTypes: a?.propertyTypes?.length ? a.propertyTypes : raw.propertyTypes || [],
      areaMinM2: a?.areaMin ?? (raw.area as { areaMinM2?: number | null } | null)?.areaMinM2 ?? null,
      areaMaxM2: a?.areaMax ?? (raw.area as { areaMaxM2?: number | null } | null)?.areaMaxM2 ?? null,
      frontageMeters: null,
      depthMeters: null,
      bedrooms: null,
      floors: null,
      legalStatus: null,
      direction: null,
    },
    requirements: {
      carAccess: Array.isArray(raw.requirements)
        ? raw.requirements.some((r: string) => /ô tô|xe hơi/i.test(r))
        : false,
      mainRoad: Array.isArray(raw.requirements)
        ? raw.requirements.some((r: string) => /mặt tiền|đường lớn/i.test(r))
        : false,
      nearCenter: Array.isArray(raw.requirements)
        ? raw.requirements.some((r: string) => /trung tâm/i.test(r))
        : false,
      nearSea: Array.isArray(raw.requirements)
        ? raw.requirements.some((r: string) => /biển/i.test(r))
        : false,
      cashflow: Array.isArray(raw.requirements)
        ? raw.requirements.some((r: string) => /dòng tiền/i.test(r))
        : false,
      rentalIncome: false,
      businessUse: Array.isArray(raw.requirements)
        ? raw.requirements.some((r: string) => /kinh doanh/i.test(r))
        : false,
      investmentPurpose: input.classification === 'investor',
      customRequirements: Array.isArray(raw.requirements) ? raw.requirements : [],
    },
    source: {
      sourceName: input.source.name,
      sourceType: input.source.type,
      authorName: input.content.authorName,
      authorUrl: input.content.authorUrl,
      canonicalUrl: input.content.canonicalUrl,
      publishedAt: input.content.publishedAt?.toISOString() ?? null,
      collectedAt: input.content.collectedAt?.toISOString() ?? null,
    },
    intelligence: {
      summary: a?.summary || null,
      reasons: a?.reasons || [],
      recommendedAction: a?.recommendedAction || null,
      replySuggestion: a?.replySuggestion || null,
      priority: input.priority,
      risks: a?.risks || [],
      missingInformation: a?.missingInformation || [],
    },
    domain: {
      classification: a?.domainClassification || 'real_estate',
      isRealEstateRelevant: a?.isRealEstateRelevant ?? true,
      primaryTransactionObject: a?.primaryTransactionObject || null,
      realEstateRelevanceReason: a?.realEstateRelevanceReason || null,
    },
    matching: {
      matchedPropertyIds: input.matching.items.map(i => i.propertyId),
      matchScores: input.matching.items.map(i => i.matchScore),
      matchReasons: input.matching.items.map(i => i.reasons),
      matchedProperties: input.matching.items,
      missingReason: input.matching.missingReason,
    },
    analysis: {
      provider: input.aiSource,
      model: null,
      promptVersion: 'lead-analyzer@v2-subject-direction',
      extractionVersion: INTELLIGENCE_VERSION,
      analyzedAt: new Date().toISOString(),
      partial: input.aiSource !== 'ai',
      errors: [],
    },
    diagnostics: {
      matchedPositive: input.scored.matchedPositive.slice(0, 20),
      matchedNegative: input.scored.matchedNegative.slice(0, 20),
      keywordReasons: input.scored.reasons.slice(0, 12),
      dedupe: input.dedupe,
      deterministicExtraction: raw,
    },
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
  if (input.mode === 'keyword_only') return { run: true, reason: 'ok' };
  if (input.mode === 'ai_first') return { run: true, reason: 'ok' };
  return { run: true, reason: 'ok' };
}

async function persistContentDedupeMeta(
  contentId: string,
  contentText: string,
  title: string,
): Promise<void> {
  try {
    const meta = buildContentDedupeMeta(contentText, title);
    await prisma.scannedContent.update({
      where: { id: contentId },
      data: {
        normalizedContentHash: meta.normalizedContentHash,
        nearDuplicateFingerprint: meta.nearDuplicateFingerprint,
        dedupeVersion: meta.dedupeVersion,
      },
    });
  } catch (error) {
    console.warn(
      '[finding-rule] persistContentDedupeMeta failed:',
      error instanceof Error ? error.message : error,
    );
  }
}

async function softDismissOutOfDomainFindings(
  scannedContentId: string,
  relevance: RealEstateRelevanceResult,
): Promise<void> {
  try {
    await prisma.agentFinding.updateMany({
      where: {
        scannedContentId,
        type: { in: ['lead_signal', 'keyword_match'] },
        status: { not: 'dismissed' },
      },
      data: {
        status: 'dismissed',
        dismissedAt: new Date(),
        dismissedBy: 'system',
        dismissReason: 'out_of_domain',
        dismissNote: `${relevance.reasonCode}; domain=${relevance.domain.classification}; object=${relevance.domain.transactionObject.normalizedType}`,
        leadFitScore: 0,
        finalScore: 0,
        score: 0,
      },
    });
  } catch {
    // ignore
  }
}

async function softDismissOutOfScopeFindings(
  scannedContentId: string,
  classification: string,
  meta?: { brokerActivity?: string; representedDemand?: string },
): Promise<void> {
  // Never soft-dismiss unknown / ambiguous / broker demand via this path.
  if (
    classification === 'unknown' ||
    classification === 'discussion' ||
    meta?.brokerActivity === 'demand_request'
  ) {
    return;
  }
  try {
    await prisma.agentFinding.updateMany({
      where: {
        scannedContentId,
        type: { in: ['lead_signal', 'keyword_match'] },
        status: { not: 'dismissed' },
      },
      data: {
        status: 'dismissed',
        dismissedAt: new Date(),
        dismissedBy: 'system',
        dismissReason: 'reclassified_out_of_scope',
        dismissNote: `classification=${classification}; brokerActivity=${meta?.brokerActivity || 'n/a'}`,
        classification,
        leadFitScore: 0,
        finalScore: 0,
      },
    });
  } catch {
    // ignore
  }
}

async function persistContentAnalysis(
  contentId: string,
  analysis: Record<string, unknown>,
  opts?: { rawAnalysis?: Record<string, unknown> },
): Promise<void> {
  try {
    const existing = await prisma.scannedContent.findUnique({
      where: { id: contentId },
      select: { metrics: true, status: true, rawData: true },
    });
    const prev =
      existing?.metrics && typeof existing.metrics === 'object'
        ? (existing.metrics as Record<string, unknown>)
        : {};
    const prevRaw =
      existing?.rawData && typeof existing.rawData === 'object'
        ? (existing.rawData as Record<string, unknown>)
        : {};

    const filterStage = String(analysis.filterStage || '');
    const nextStatus =
      filterStage === 'created_finding' || filterStage === 'duplicate'
        ? 'analyzed'
        : filterStage === 'blocked'
          ? 'blocked'
        : filterStage === 'domain_needs_review'
          ? 'needs_review'
        : filterStage === 'hard_spam' ||
            filterStage === 'spam_ignored' ||
            filterStage === 'too_short' ||
            filterStage === 'keyword_gate' ||
            filterStage === 'low_final_score' ||
            filterStage === 'out_of_scope' ||
            filterStage === 'out_of_domain' ||
            filterStage === 'ignored_by_rule'
          ? 'ignored'
          : existing?.status || 'collected';

    const spamMeta =
      analysis.spamDecision || analysis.matchedSpamRuleIds
        ? {
            spamDecision: analysis.spamDecision,
            spamReason: analysis.spamReason,
            matchedSpamRuleIds: analysis.matchedSpamRuleIds,
            blockedAt: analysis.blockedAt,
            blockedByRuleVersion: analysis.blockedByRuleVersion,
            spamExplanations: analysis.spamExplanations,
          }
        : {};

    const nextRawData = opts?.rawAnalysis
      ? {
          ...prevRaw,
          analysis: {
            ...((prevRaw.analysis as Record<string, unknown>) || {}),
            ...opts.rawAnalysis,
          },
          ...spamMeta,
        }
      : Object.keys(spamMeta).length
        ? { ...prevRaw, ...spamMeta }
        : undefined;

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
        ...(nextRawData
          ? { rawData: nextRawData as Prisma.InputJsonValue }
          : {}),
        ...(shouldEnqueueSync()
          ? { syncStatus: 'pending', syncError: null }
          : {}),
      },
    });

    // Content without Finding still syncs when VPS sync enabled
    if (shouldEnqueueSync() && filterStage !== 'created_finding') {
      void enqueueScannedContentSync({ scannedContentId: contentId }).catch(() => undefined);
    }
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

/** @deprecated Prefer leadFitScore path — kept for unit tests */
export function applyDeterministicBoost(
  baseScore: number,
  d: DeterministicExtraction,
): number {
  const cls = d.property.classification;
  const isHighValue = cls === 'buyer' || cls === 'investor' || cls === 'renter';
  if (!isHighValue) return baseScore;

  let boost = 15;
  if (d.phone.primaryPhone) boost += 10;
  if (d.money.budgetMin != null || d.money.budgetMax != null || d.money.askingPrice != null) {
    boost += 8;
  }
  if (d.location.primaryLocation) boost += 5;

  return Math.min(100, baseScore + boost);
}

async function ensureScannedContentRow(content: ScannedContent): Promise<ScannedContent> {
  const existing = await prisma.scannedContent.findUnique({ where: { id: content.id } });
  if (existing) return existing;

  const byHash = await prisma.scannedContent.findUnique({
    where: {
      sourceId_contentHash: {
        sourceId: content.sourceId,
        contentHash: content.contentHash,
      },
    },
  });
  if (byHash) return byHash;

  console.warn(
    `[findingRuleEngine] re-creating scanned content ${content.id.slice(0, 8)}… after mid-job wipe`,
  );
  const meta = buildContentDedupeMeta(content.contentText);
  return prisma.scannedContent.create({
    data: {
      id: content.id,
      companyId: content.companyId,
      sourceId: content.sourceId,
      externalId: content.externalId,
      canonicalUrl: content.canonicalUrl,
      authorName: content.authorName,
      authorUrl: content.authorUrl,
      contentText: content.contentText,
      contentHash: content.contentHash,
      normalizedContentHash: meta.normalizedContentHash,
      nearDuplicateFingerprint: meta.nearDuplicateFingerprint,
      dedupeVersion: meta.dedupeVersion,
      publishedAt: content.publishedAt,
      collectedAt: content.collectedAt ?? new Date(),
      status: content.status || 'collected',
      rawData: (content.rawData ?? undefined) as Prisma.InputJsonValue | undefined,
      metrics: (content.metrics ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
