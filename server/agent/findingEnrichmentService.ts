/**
 * Async AI enrichment for AgentFinding — never blocks scan/finding creation.
 * Fallback: Gemini → GPT → local LLM → keyword enrichment.
 */

import { prisma } from '../prisma';
import { analyzeLeadContent } from '../agent/leadAnalyzer';
import {
  computeIntelligenceFinalScore,
  normalizeActorRole,
  normalizeClassification,
  normalizeIntent,
  priorityFromScore,
} from '../agent/leadIntelligence';
import { detectSubjectDirection } from '../agent/subjectDirection';
import { sendNotification } from '../notifications/notificationRouter';
import { enqueueLeadAcquisition } from '../modules/lead-acquisition';

export const FINDING_ENRICHMENT_STATUSES = [
  'raw',
  'enriching',
  'enriched',
  'failed_enrichment',
] as const;

export type FindingEnrichmentStatus = (typeof FINDING_ENRICHMENT_STATUSES)[number];

let lastDegradedAlertAt = 0;
const DEGRADED_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

export function isQuotaExhaustedError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('429') ||
    m.includes('resource_exhausted') ||
    m.includes('quota') ||
    m.includes('rate-limit') ||
    m.includes('rate limit')
  );
}

export async function notifyAiDegradedMode(input?: {
  detail?: string;
  companyId?: string | null;
}): Promise<void> {
  const now = Date.now();
  if (now - lastDegradedAlertAt < DEGRADED_ALERT_COOLDOWN_MS) return;
  lastDegradedAlertAt = now;
  try {
    await sendNotification({
      type: 'health',
      immediate: true,
      skipDedup: true,
      text: [
        '⚠️ Gemini quota exhausted.',
        'Running in degraded mode.',
        'Finding quality reduced.',
        'Findings vẫn được tạo từ Rule Engine (RAW) — không phải 0 findings.',
        input?.detail ? `Chi tiết: ${input.detail.slice(0, 240)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      payload: {
        title: 'AI degraded mode',
        summary: 'Gemini quota exhausted — findings still created via rules',
        detail: input?.detail || null,
        entityId: input?.companyId || null,
      },
    });
  } catch (err) {
    console.warn('[finding-enrichment] degraded alert failed:', err);
  }
}

/** Fire-and-forget enrichment after RAW finding create. */
export function enqueueFindingEnrichment(findingId: string): void {
  void enrichFindingAsync(findingId).catch(err => {
    console.warn('[finding-enrichment] async failed:', findingId, err);
  });
}

export async function enrichFindingAsync(findingId: string): Promise<void> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: findingId },
    include: {
      scannedContent: { select: { contentText: true, canonicalUrl: true, companyId: true } },
      source: { select: { type: true, config: true } },
    },
  });
  if (!finding) return;
  if (finding.status === 'dismissed' || finding.status === 'duplicate') return;
  if (finding.status === 'enriched') return;

  await prisma.agentFinding.update({
    where: { id: findingId },
    data: {
      status: finding.status === 'raw' || finding.status === 'new' ? 'enriching' : finding.status,
      scoreStatus: 'enriching',
    },
  });

  const title = finding.title || '';
  const body = finding.scannedContent?.contentText || finding.summary || '';
  const keywordScore = finding.keywordScore ?? 0;
  const leadFitScore = finding.leadFitScore ?? 0;
  const sourceConfig =
    finding.source?.config && typeof finding.source.config === 'object' && !Array.isArray(finding.source.config)
      ? (finding.source.config as Record<string, unknown>)
      : {};
  const positiveKeywords = Array.isArray(sourceConfig.positiveKeywords)
    ? (sourceConfig.positiveKeywords as string[])
    : undefined;
  const negativeKeywords = Array.isArray(sourceConfig.negativeKeywords)
    ? (sourceConfig.negativeKeywords as string[])
    : undefined;

  let aiScore: number | null = null;
  let enrichmentSource: 'ai' | 'fallback' | 'keyword' = 'keyword';
  let degraded = false;
  let degradedDetail = '';

  try {
    const analysisOutput = await analyzeLeadContent(
      {
        title,
        bodyText: body,
        canonicalUrl: finding.scannedContent?.canonicalUrl || '',
        sourceType: finding.source?.type,
        positiveKeywords,
        negativeKeywords,
        deepAnalyze: true,
      },
      {
        preferredProviders: ['gemini', 'openai', 'ollama'],
      },
    );

    if (analysisOutput.meta?.degradedQuota) {
      degraded = true;
      degradedDetail = analysisOutput.meta.degradedDetail || 'quota';
    }

    if (analysisOutput.ran && analysisOutput.analysis) {
      const analysis = analysisOutput.analysis;
      aiScore = analysis.score;
      enrichmentSource = analysisOutput.meta?.source === 'ai' ? 'ai' : 'fallback';

      const direction = detectSubjectDirection(`${title}\n${body}`);
      let classification = normalizeClassification(analysis.classification);
      if (direction.classification !== 'unknown') classification = direction.classification;
      const intent = normalizeIntent(analysis.intent || direction.intent);
      let actorRole = normalizeActorRole(
        direction.actorRole !== 'unknown' ? direction.actorRole : analysis.actorRole,
      );

      const ruleScore = Math.max(keywordScore, leadFitScore, finding.finalScore ?? 0);
      const finalScore = computeIntelligenceFinalScore({
        leadFitScore: Math.max(leadFitScore, 1),
        aiScore,
        keywordScore,
        targetMatched: true,
        ruleScore,
      });
      const hasPhone = Boolean(analysis.contact?.phone || finding.primaryPhone);
      const priority = priorityFromScore(finalScore, hasPhone);

      const extracted =
        finding.extractedData && typeof finding.extractedData === 'object'
          ? { ...(finding.extractedData as Record<string, unknown>) }
          : {};
      extracted.enrichment = {
        source: enrichmentSource,
        at: new Date().toISOString(),
        degraded,
      };

      await prisma.agentFinding.update({
        where: { id: findingId },
        data: {
          status: 'enriched',
          scoreStatus: 'enriched',
          classification,
          intent,
          actorRole,
          aiScore,
          finalScore,
          score: finalScore,
          priority,
          confidence: analysis.confidence ?? finding.confidence,
          primaryPhone: analysis.contact?.phone || finding.primaryPhone,
          primaryLocation: analysis.region || finding.primaryLocation,
          title: (analysis.title || finding.title).slice(0, 90),
          summary: (analysis.summary || finding.summary).slice(0, 600),
          extractedData: extracted as object,
          reasons: [
            ...((Array.isArray(finding.reasons) ? finding.reasons : []) as string[]).slice(0, 8),
            `enrichment:${enrichmentSource}`,
            ...(degraded ? ['enrichment:degraded_quota'] : []),
          ] as object,
        },
      });
    } else {
      await applyKeywordEnrichment(findingId, finding, keywordScore, leadFitScore, 'no_analysis');
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isQuotaExhaustedError(msg)) {
      degraded = true;
      degradedDetail = msg;
    }
    console.warn('[finding-enrichment] AI enrich failed, keyword fallback:', msg.slice(0, 200));
    await applyKeywordEnrichment(findingId, finding, keywordScore, leadFitScore, msg.slice(0, 120));
  }

  if (degraded) {
    await notifyAiDegradedMode({
      detail: degradedDetail,
      companyId: finding.companyId,
    });
  }

  // Re-score Lead Acquisition with AI/keyword scores (no Telegram re-blast)
  enqueueLeadAcquisition(findingId, false);
}

async function applyKeywordEnrichment(
  findingId: string,
  finding: {
    title: string;
    summary: string;
    keywordScore: number | null;
    leadFitScore: number | null;
    finalScore: number | null;
    primaryPhone: string | null;
    extractedData: unknown;
    reasons: unknown;
  },
  keywordScore: number,
  leadFitScore: number,
  reason: string,
): Promise<void> {
  const direction = detectSubjectDirection(`${finding.title}\n${finding.summary}`);
  const ruleScore = Math.max(
    keywordScore,
    leadFitScore,
    finding.finalScore ?? 0,
    direction.demandSignals.length ? 45 : 0,
  );
  const finalScore = computeIntelligenceFinalScore({
    leadFitScore: Math.max(leadFitScore, ruleScore > 0 ? 40 : 0),
    aiScore: null,
    keywordScore,
    targetMatched: true,
    ruleScore,
  });
  const extracted =
    finding.extractedData && typeof finding.extractedData === 'object'
      ? { ...(finding.extractedData as Record<string, unknown>) }
      : {};
  extracted.enrichment = {
    source: 'keyword',
    at: new Date().toISOString(),
    reason,
  };

  await prisma.agentFinding.update({
    where: { id: findingId },
    data: {
      status: 'failed_enrichment',
      scoreStatus: 'failed_enrichment',
      finalScore,
      score: finalScore,
      priority: priorityFromScore(finalScore, Boolean(finding.primaryPhone)),
      classification:
        direction.classification !== 'unknown'
          ? direction.classification
          : undefined,
      actorRole: direction.actorRole !== 'unknown' ? direction.actorRole : undefined,
      extractedData: extracted as object,
      reasons: [
        ...((Array.isArray(finding.reasons) ? finding.reasons : []) as string[]).slice(0, 8),
        'enrichment:keyword_fallback',
        `enrichment_fail:${reason}`,
      ] as object,
    },
  });
}
