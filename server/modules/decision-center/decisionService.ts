/**
 * Decision service — gate AI enrichment; persist profile on finding.
 */

import { prisma } from '../../prisma';
import { decideOutcome, evaluateLeadDecision } from './engines';
import {
  getCachedDecision,
  getCampaignMap,
  getDecisionMetrics,
  getRecentDecisions,
  listDecisionRules,
  pushRecentDecision,
  putCachedDecision,
  recordAiReviewed,
  recordDecisionMetrics,
} from './store';
import type {
  DecisionCenterSnapshot,
  DecisionIntent,
  LeadDecisionResult,
} from './types';

export function readDecisionProfile(extractedData: unknown): LeadDecisionResult | null {
  if (!extractedData || typeof extractedData !== 'object') return null;
  const d = (extractedData as Record<string, unknown>).decisionCenter;
  if (!d || typeof d !== 'object') return null;
  return d as LeadDecisionResult;
}

function mapFindingActorToIntent(
  actorRole: string | null | undefined,
  classification: string | null | undefined,
): DecisionIntent | null {
  const blob = `${actorRole || ''} ${classification || ''}`.toLowerCase();
  if (/\bbroker\b|môi giới/.test(blob)) return 'broker';
  if (/\bseller\b|supply|listing/.test(blob)) return 'seller';
  if (/\bbuyer\b|demand/.test(blob)) return 'buyer';
  if (/\brent\b|rental/.test(blob)) return 'rent';
  if (/\bspam\b/.test(blob)) return 'spam';
  return null;
}

/**
 * When Decision keywords miss but Scanner already classified actor,
 * apply actor prior so broker/seller are not left as unknown_insufficient_evidence.
 */
export function applyActorPriorToDecision(
  result: LeadDecisionResult,
  actorRole: string | null | undefined,
  classification: string | null | undefined,
): LeadDecisionResult {
  if (result.intent !== 'unknown' || result.matchedRules.length > 0) return result;
  const prior = mapFindingActorToIntent(actorRole, classification);
  if (!prior) return result;
  const outcome = decideOutcome({ ruleScore: result.ruleScore, intent: prior });
  return {
    ...result,
    intent: prior,
    intentConfidence: Math.max(result.intentConfidence, 0.55),
    decision: outcome.decision,
    aiAllowed: outcome.aiAllowed,
    reason: `actor_prior_${prior}:${outcome.reason}`,
    reasons: [`actor_prior:${prior}`, outcome.reason, ...result.reasons].slice(0, 12),
  };
}

export async function evaluateTextDecision(text: string): Promise<LeadDecisionResult> {
  const rules = await listDecisionRules();
  const campaignMap = await getCampaignMap();
  const normalizedHashPreview = evaluateLeadDecision({ text, rules, campaignMap });
  const cached = await getCachedDecision(normalizedHashPreview.contentHash);
  const result = evaluateLeadDecision({ text, rules, campaignMap, cached });
  if (!result.cacheHit) await putCachedDecision(result);

  // H3.6.1 — feed Knowledge (unknown terms + concept hits); never blocks decision
  try {
    const { observeTextForKnowledge, listConcepts, recordCoverageEvent } = await import(
      '../knowledge-base'
    );
    const concepts = await listConcepts();
    const matchedIds = new Set<string>();
    for (const hit of result.matchedRules) {
      const concept = concepts.find(
        c =>
          c.aliases.some(a => a.toLowerCase() === hit.keyword.toLowerCase()) ||
          c.synonyms.some(a => a.toLowerCase() === hit.keyword.toLowerCase()),
      );
      if (concept) matchedIds.add(concept.id);
    }
    const observed = await observeTextForKnowledge({
      text,
      matchedConceptIds: [...matchedIds],
    });
    await recordCoverageEvent({
      ruleMatched: result.matchedRules.length > 0,
      aiNeeded: result.decision === 'ai_review',
      discarded: result.decision === 'discard',
      hadUnknown: observed.unknownTerms.length > 0,
    });
  } catch (err) {
    console.warn('[decision-center] knowledge observe failed:', err);
  }

  return result;
}

/**
 * Run decision for a finding. Returns whether AI enrichment is allowed.
 * Does not call AI itself — AI Gate only.
 */
export async function processFindingDecision(
  findingId: string,
  options?: { force?: boolean },
): Promise<{
  result: LeadDecisionResult;
  allowAi: boolean;
}> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: findingId },
    include: {
      scannedContent: { select: { contentText: true } },
      source: { select: { id: true, name: true } },
      mission: { select: { id: true, name: true } },
    },
  });
  if (!finding) {
    throw new Error(`Finding not found: ${findingId}`);
  }

  const existing = readDecisionProfile(finding.extractedData);
  if (!options?.force && existing?.version === 'h36_decision_v1' && existing.decision) {
    // Reuse stored decision unless AI path still pending
    return { result: existing, allowAi: existing.aiAllowed && !existing.aiUsed };
  }

  const text = [finding.title, finding.summary, finding.scannedContent?.contentText || '']
    .filter(Boolean)
    .join('\n');

  // Force path bypasses decision cache so rule-library updates take effect.
  let evaluated: LeadDecisionResult;
  if (options?.force) {
    const rules = await listDecisionRules();
    const campaignMap = await getCampaignMap();
    evaluated = evaluateLeadDecision({ text, rules, campaignMap });
    await putCachedDecision(evaluated).catch(() => undefined);
  } else {
    evaluated = await evaluateTextDecision(text);
  }

  const result = applyActorPriorToDecision(
    evaluated,
    finding.actorRole,
    finding.classification,
  );

  const extracted =
    finding.extractedData && typeof finding.extractedData === 'object'
      ? { ...(finding.extractedData as Record<string, unknown>) }
      : {};
  extracted.decisionCenter = result;

  const reasons = [
    ...((Array.isArray(finding.reasons) ? finding.reasons : []) as string[]),
    `decision:${result.decision}`,
    `ruleScore:${result.ruleScore}`,
    `intent:${result.intent}`,
    `reason:${result.reason}`,
  ].slice(0, 16);

  let status = finding.status;
  let scoreStatus = finding.scoreStatus;
  const patch: Record<string, unknown> = {
    extractedData: extracted,
    reasons: reasons as object,
    keywordScore: Math.max(finding.keywordScore ?? 0, result.ruleScore),
  };

  if (result.decision === 'discard') {
    status = 'dismissed';
    scoreStatus = finding.scoreStatus || 'raw';
    patch.status = status;
    patch.scoreStatus = scoreStatus;
    patch.finalScore = Math.min(finding.finalScore ?? 0, result.ruleScore);
    patch.dismissedAt = new Date();
    patch.dismissedBy = 'decision-engine';
    patch.intent = result.intent;
    patch.actorRole =
      result.intent === 'broker'
        ? 'broker'
        : result.intent === 'seller'
          ? 'seller'
          : finding.actorRole;
  } else if (result.decision === 'qualified_candidate') {
    status = 'enriched';
    scoreStatus = 'enriched';
    patch.status = status;
    patch.scoreStatus = scoreStatus;
    patch.finalScore = Math.max(finding.finalScore ?? 0, result.ruleScore);
    patch.score = patch.finalScore;
    patch.classification = result.intent === 'buyer' ? 'demand' : finding.classification;
    patch.intent = result.intent;
    patch.actorRole =
      result.intent === 'buyer'
        ? 'buyer'
        : result.intent === 'seller'
          ? 'seller'
          : result.intent === 'broker'
            ? 'broker'
            : finding.actorRole;
    patch.dismissedAt = null;
    patch.dismissedBy = null;
    if (result.campaign) {
      patch.primaryLocation = result.campaign.campaignName;
    }
  } else if (result.decision === 'manual_review') {
    // Re-open dismissed unknowns for manual queue (UNKNOWN ≠ auto-spam)
    patch.status =
      finding.status === 'dismissed' ||
      finding.status === 'enriching' ||
      finding.status === 'duplicate' ||
      finding.status === 'new'
        ? 'raw'
        : finding.status;
    patch.scoreStatus = 'raw';
    patch.finalScore = Math.max(finding.finalScore ?? 0, result.ruleScore);
    patch.intent = result.intent;
    patch.dismissedAt = null;
    patch.dismissedBy = null;
  } else if (result.decision === 'ai_review') {
    patch.finalScore = Math.max(finding.finalScore ?? 0, result.ruleScore);
    patch.intent = result.intent;
    patch.dismissedAt = null;
    patch.dismissedBy = null;
  }

  await prisma.agentFinding.update({
    where: { id: findingId },
    data: patch as object,
  });

  await recordDecisionMetrics({
    decision: result.decision,
    aiUsed: false,
    cacheHit: result.cacheHit,
  });

  await pushRecentDecision({
    findingId,
    title: (finding.title || '').slice(0, 80),
    ruleScore: result.ruleScore,
    intent: result.intent,
    decision: result.decision,
    aiUsed: false,
    reason: result.reason,
    matchedRules: result.matchedRules.map(m => m.keyword).slice(0, 8),
    at: result.at,
  });

  try {
    const { listConcepts, recordRuleDecisionEvent } = await import('../knowledge-base');
    const concepts = await listConcepts();
    const matchedKeywords = result.matchedRules.map(hit => {
      const concept = concepts.find(
        c =>
          c.aliases.some(a => a.toLowerCase() === hit.keyword.toLowerCase()) ||
          c.synonyms.some(a => a.toLowerCase() === hit.keyword.toLowerCase()),
      );
      return {
        keyword: hit.keyword,
        category: hit.category,
        conceptId: concept?.id || null,
        conceptName: concept?.concept || hit.group,
      };
    });
    await recordRuleDecisionEvent({
      matchedKeywords,
      decision: result.decision,
      intent: result.intent,
      locationLabel: result.campaign?.campaignName || finding.primaryLocation,
      sourceId: finding.sourceId || finding.source?.id || null,
      sourceLabel: finding.source?.name || null,
      missionId: finding.missionId || finding.mission?.id || null,
      missionLabel: finding.mission?.name || null,
      missionKeyword: finding.mission?.name || result.campaign?.campaignName || null,
      hadUnknown: result.intent === 'unknown',
    });
  } catch (err) {
    console.warn('[decision-center] rule analytics failed:', err);
  }

  return { result, allowAi: result.aiAllowed && !result.aiUsed };
}

/** Mark that AI was used for an ai_review finding */
export async function markDecisionAiUsed(findingId: string): Promise<void> {
  const finding = await prisma.agentFinding.findUnique({ where: { id: findingId } });
  if (!finding) return;
  const profile = readDecisionProfile(finding.extractedData);
  if (!profile) return;
  const next = { ...profile, aiUsed: true, at: new Date().toISOString() };
  const extracted =
    finding.extractedData && typeof finding.extractedData === 'object'
      ? { ...(finding.extractedData as Record<string, unknown>) }
      : {};
  extracted.decisionCenter = next;
  await prisma.agentFinding.update({
    where: { id: findingId },
    data: { extractedData: extracted as object },
  });
  await recordAiReviewed();
  await pushRecentDecision({
    findingId,
    title: (finding.title || '').slice(0, 80),
    ruleScore: next.ruleScore,
    intent: next.intent,
    decision: next.decision,
    aiUsed: true,
    reason: next.reason,
    matchedRules: next.matchedRules.map(m => m.keyword).slice(0, 8),
    at: next.at,
  });
}

export async function buildDecisionSnapshot(): Promise<DecisionCenterSnapshot> {
  const [metrics, rules, recent] = await Promise.all([
    getDecisionMetrics(),
    listDecisionRules(),
    getRecentDecisions(80),
  ]);
  return {
    version: 'h36_decision_v1',
    metrics,
    rules,
    recent,
  };
}

export function formatDecisionReport(metrics: Awaited<ReturnType<typeof getDecisionMetrics>>): string {
  const lines = [
    'Decision Report',
    '',
    'Scanned',
    String(metrics.scanned),
    '',
    'Discarded',
    String(metrics.discarded),
    '',
    'Rule Passed',
    String(metrics.rulePassed),
    '',
    'AI Reviewed',
    String(metrics.aiReviewed),
    '',
    'Qualified',
    String(metrics.qualified),
    '',
    'Token Saved',
    `${metrics.aiSavingPercent}%`,
  ];
  return lines.join('\n');
}

export async function getDecisionReportText(): Promise<string> {
  return formatDecisionReport(await getDecisionMetrics());
}
