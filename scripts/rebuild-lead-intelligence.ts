#!/usr/bin/env node
/**
 * Rebuild Lead Intelligence from existing ScannedContent.
 *
 * Dry-run by default. Pass --apply to write.
 *
 *   npm run agent:rebuild-lead-intelligence
 *   npm run agent:rebuild-lead-intelligence -- --limit=100
 *   npm run agent:rebuild-lead-intelligence -- --limit=100 --apply
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { ensureDatabaseReady } from '../server/dbHelper';
import { processFindingForContent } from '../server/agent-worker/services/findingRuleEngine';
import { getLeadAnalysisLimits, buildDeterministicFallback } from '../server/agent/leadAnalyzer';
import { buildContentDedupeMeta } from '../server/agent/dedup/findingDedupService';
import { runLeadPrefilter } from '../server/agent/leadPrefilter';
import { resolveLeadAnalysisConfig } from '../server/agent/analysisConfig';
import {
  computeIntelligenceFinalScore,
  computeLeadFitScore,
  normalizeClassification,
  actorRoleFromClassification,
  type LeadClassification,
  type ActorRole,
} from '../server/agent/leadIntelligence';
import { extractLeadData } from '../server/agent/extractors';
import {
  detectSubjectDirection,
  resolveRebuildAction,
  type RebuildAction,
  type RepresentedDemand,
  type BrokerActivity,
} from '../server/agent/subjectDirection';
import { evaluateRealEstateRelevance } from '../server/agent/domainClassification';

function argValue(...names: string[]): string | undefined {
  for (const name of names) {
    const prefix = `--${name}=`;
    const hit = process.argv.find(a => a.startsWith(prefix));
    if (hit) return hit.slice(prefix.length);
  }
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

type DryRow = {
  id: string;
  originalTitle: string;
  oldClassification: string | null;
  newClassification: string;
  actorRole: string;
  representedDemand: RepresentedDemand;
  brokerActivity: BrokerActivity;
  demandSignals: string[];
  supplySignals: string[];
  confidence: number;
  reviewReason: string | null;
  keywordScore: number;
  aiScore: number | null;
  leadFitScore: number;
  finalScore: number;
  targetMatch: boolean;
  duplicateStatus: string;
  action: RebuildAction;
  domain?: string;
  transactionObject?: string;
  relevanceScore?: number;
  domainDecision?: string;
  oldFindingStatus?: string | null;
};

async function main() {
  await ensureDatabaseReady();
  const limit = Math.max(1, Math.min(500, Number(argValue('limit') || 50) || 50));
  const sourceId = argValue('source-id', 'sourceId');
  const apply = hasFlag('apply');
  const includeDismissed = hasFlag('include-dismissed');
  const runDedupe = true;

  console.log('\n=== Rebuild Lead Intelligence ===');
  console.log(`  mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  limit: ${limit}`);
  console.log(`  sourceId: ${sourceId || '(all)'}`);
  console.log(`  includeDismissed: ${includeDismissed}`);
  console.log(`  dedupe meta: ${runDedupe}`);
  console.log(`  analysis limits:`, getLeadAnalysisLimits());

  const contents = await prisma.scannedContent.findMany({
    where: {
      ...(sourceId ? { sourceId } : {}),
    },
    orderBy: { collectedAt: 'desc' },
    take: limit,
    include: {
      source: true,
      findings: {
        where: { type: { in: ['lead_signal', 'keyword_match'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const rows: DryRow[] = [];
  const budget = { used: 0, max: getLeadAnalysisLimits().maxPerJob * 10 };

  for (const content of contents) {
    const existing = content.findings[0] || null;
    const title =
      content.authorName
        ? `${content.authorName}: ${content.contentText.slice(0, 80)}`
        : content.contentText.slice(0, 100);
    const haystack = `${title}\n${content.contentText}`;

    if (existing?.status === 'dismissed' && !includeDismissed) {
      const direction = detectSubjectDirection(haystack);
      rows.push({
        id: content.id,
        originalTitle: (existing.title || content.contentText).slice(0, 80).replace(/\n/g, ' '),
        oldClassification: existing.classification,
        newClassification: existing.classification || direction.classification,
        actorRole: existing.actorRole || direction.actorRole,
        representedDemand: direction.representedDemand,
        brokerActivity: direction.brokerActivity,
        demandSignals: direction.demandSignals,
        supplySignals: direction.supplySignals,
        confidence: direction.confidence,
        reviewReason: null,
        keywordScore: existing.keywordScore ?? 0,
        aiScore: existing.aiScore,
        leadFitScore: existing.leadFitScore ?? 0,
        finalScore: existing.finalScore ?? existing.score,
        targetMatch: false,
        duplicateStatus: existing.dedupeStatus,
        action: 'skip_existing_dismissed',
      });
      continue;
    }

    if (runDedupe && apply) {
      const meta = buildContentDedupeMeta(content.contentText, title);
      await prisma.scannedContent.update({
        where: { id: content.id },
        data: {
          normalizedContentHash: meta.normalizedContentHash,
          nearDuplicateFingerprint: meta.nearDuplicateFingerprint,
          dedupeVersion: meta.dedupeVersion,
        },
      });
    }

    const config = resolveLeadAnalysisConfig(content.source, null);
    const deterministic = extractLeadData(content.contentText);
    const direction = detectSubjectDirection(haystack);
    const relevance = evaluateRealEstateRelevance(haystack);
    const prefilter = runLeadPrefilter({
      title,
      bodyText: content.contentText,
      positiveKeywords: config.positiveKeywords,
      negativeKeywords: config.negativeKeywords,
      prefilterMinScore: config.prefilterMinScore,
      minBodyLength: config.minBodyLength,
    });
    const fallback = buildDeterministicFallback(
      {
        title,
        bodyText: content.contentText,
        canonicalUrl: content.canonicalUrl,
      },
      prefilter,
    );

    // Prefer subject-direction over weak unknown fallback/extractor
    let classification = direction.classification;
    if (classification === 'unknown') {
      classification = normalizeClassification(
        fallback.classification !== 'unknown'
          ? fallback.classification
          : deterministic.property.classification,
      );
    }
    let actorRole: ActorRole =
      direction.actorRole !== 'unknown'
        ? direction.actorRole
        : ((fallback.actorRole as ActorRole) || 'unknown');
    if (actorRole === 'unknown') {
      actorRole = actorRoleFromClassification(classification);
    }
    const representedDemand =
      direction.representedDemand !== 'unknown' && direction.representedDemand !== 'none'
        ? direction.representedDemand
        : classification === 'buyer' || classification === 'renter' || classification === 'investor'
          ? classification
          : direction.representedDemand;
    const brokerActivity = direction.brokerActivity;
    const confidence =
      direction.classification !== 'unknown' ? direction.confidence : fallback.confidence;

    const domainRejected = relevance.decision === 'reject';
    const targetMatch =
      !domainRejected && config.targetClassifications.includes(classification);
    const leadFitScore = domainRejected
      ? 0
      : computeLeadFitScore({
          classification,
          actorRole,
          targetClassifications: config.targetClassifications as LeadClassification[],
          hasPhone: Boolean(deterministic.phone.primaryPhone || fallback.contact.phone),
          hasBudget: Boolean(
            deterministic.money.budgetMin ||
              deterministic.money.budgetMax ||
              fallback.budgetMin ||
              fallback.budgetMax,
          ),
          hasLocation: Boolean(deterministic.location.primaryLocation || fallback.region),
          hasPropertyType: Boolean(
            (deterministic.property.propertyTypes || []).length || fallback.propertyTypes.length,
          ),
          urgency: fallback.urgency,
        });
    const keywordScore = domainRejected ? 0 : Math.min(100, prefilter.score);
    const aiScore = domainRejected ? 0 : fallback.score;
    const finalScore = domainRejected
      ? 0
      : computeIntelligenceFinalScore({
          leadFitScore,
          aiScore,
          keywordScore,
          targetMatched: targetMatch && actorRole === 'demand_side',
        });

    const resolved = resolveRebuildAction({
      classification,
      actorRole,
      representedDemand,
      brokerActivity,
      finalScore,
      minFindingScore: config.minScore,
      dedupeStatus: existing?.dedupeStatus || 'unique',
      duplicateConfidence: existing?.similarityScore ?? null,
      existingStatus: existing?.status,
      spamCertain: classification === 'spam' || prefilter.isHardSpam,
      domainDecision: relevance.decision,
      domainReasonCode: relevance.reasonCode,
    });

    rows.push({
      id: content.id,
      originalTitle: (existing?.title || content.contentText).slice(0, 80).replace(/\n/g, ' '),
      oldClassification: existing?.classification || null,
      newClassification: classification,
      actorRole,
      representedDemand,
      brokerActivity,
      demandSignals: direction.demandSignals,
      supplySignals: direction.supplySignals,
      confidence,
      reviewReason: resolved.reviewReason,
      keywordScore,
      aiScore,
      leadFitScore,
      finalScore,
      targetMatch,
      duplicateStatus: existing?.dedupeStatus || 'unique',
      action: resolved.action,
      domain: relevance.domain.classification,
      transactionObject: relevance.domain.transactionObject.normalizedType,
      relevanceScore: relevance.relevanceScore,
      domainDecision: relevance.decision,
      oldFindingStatus: existing?.status || null,
    });

    if (apply) {
      // Only write dismiss/update paths; needs_review does not auto-dismiss
      if (resolved.action === 'needs_review' || resolved.action === 'skip_existing_dismissed') {
        continue;
      }
      if (resolved.action === 'duplicate') {
        continue;
      }
      const prev = process.env.AGENT_LEAD_ANALYSIS_SKIP_AI;
      if (process.env.AGENT_REBUILD_USE_AI !== '1') {
        process.env.AGENT_LEAD_ANALYSIS_SKIP_AI = '1';
      }
      try {
        if (
          (resolved.action === 'dismiss' || resolved.action === 'dismiss_out_of_domain') &&
          existing
        ) {
          await prisma.agentFinding.update({
            where: { id: existing.id },
            data: {
              status: 'dismissed',
              dismissedAt: new Date(),
              dismissedBy: 'system',
              dismissReason:
                resolved.action === 'dismiss_out_of_domain'
                  ? 'out_of_domain'
                  : 'rebuild_supply_out_of_scope',
              dismissNote:
                resolved.action === 'dismiss_out_of_domain'
                  ? `domain=${relevance.domain.classification}; object=${relevance.domain.transactionObject.normalizedType}; ${relevance.reasonCode}`
                  : `classification=${classification}; brokerActivity=${brokerActivity}`,
              classification,
              actorRole,
              leadFitScore: 0,
              finalScore: 0,
            },
          });
        } else if (
          resolved.action === 'update' ||
          resolved.action === 'dismiss' ||
          resolved.action === 'dismiss_out_of_domain'
        ) {
          // dismiss without existing finding = analysis only via processFinding
          await processFindingForContent({
            content,
            source: content.source,
            mission: null,
            title,
            analysisBudget: budget,
          });
        }
      } finally {
        if (prev === undefined) delete process.env.AGENT_LEAD_ANALYSIS_SKIP_AI;
        else process.env.AGENT_LEAD_ANALYSIS_SKIP_AI = prev;
      }
    }
  }

  console.log('\n--- Dry-run / result table ---\n');
  const header = [
    'title'.padEnd(36),
    'new'.padEnd(9),
    'actor'.padEnd(12),
    'repr'.padEnd(8),
    'brokerAct'.padEnd(14),
    'dem'.padEnd(12),
    'sup'.padEnd(12),
    'conf',
    'fin',
    'action'.padEnd(22),
    'reviewReason',
  ].join(' | ');
  console.log(header);
  console.log('-'.repeat(Math.min(200, header.length + 40)));

  for (const row of rows) {
    console.log(
      [
        row.originalTitle.slice(0, 36).padEnd(36),
        row.newClassification.padEnd(9),
        row.actorRole.padEnd(12),
        row.representedDemand.padEnd(8),
        row.brokerActivity.padEnd(14),
        row.demandSignals.slice(0, 2).join(',').slice(0, 12).padEnd(12),
        row.supplySignals.slice(0, 2).join(',').slice(0, 12).padEnd(12),
        row.confidence.toFixed(2).padStart(4),
        String(row.finalScore).padStart(3),
        row.action.padEnd(22),
        row.reviewReason || '—',
      ].join(' | '),
    );
  }

  const counts: Record<string, number> = {};
  const bump = (k: string) => {
    counts[k] = (counts[k] || 0) + 1;
  };
  for (const r of rows) {
    bump(r.action);
    bump(`class:${r.newClassification}`);
    if (r.domain) bump(`domain:${r.domain}`);
    if (r.domainDecision) bump(`domainDecision:${r.domainDecision}`);
    if (r.action === 'needs_review' && r.newClassification === 'unknown') bump('unknown_review');
    if (r.brokerActivity === 'demand_request') bump('broker_demand');
    if (r.brokerActivity === 'supply_listing') bump('broker_supply');
    if (
      r.action === 'dismiss' &&
      (r.newClassification === 'seller' ||
        r.newClassification === 'landlord' ||
        r.brokerActivity === 'supply_listing' ||
        r.brokerActivity === 'recruitment')
    ) {
      bump('supply_dismissed');
    }
    if (r.action === 'dismiss_out_of_domain') bump('out_of_domain_dismiss');
  }

  const reAccepted = rows.filter(r => r.domainDecision === 'accept').length;
  const vehicleRejected = rows.filter(
    r => r.domain === 'vehicle' && r.domainDecision === 'reject',
  ).length;
  const consumerRejected = rows.filter(
    r => r.domain === 'consumer_goods' && r.domainDecision === 'reject',
  ).length;
  const unknownReview = rows.filter(r => r.domainDecision === 'needs_review').length;
  const falseFindings = rows.filter(
    r =>
      r.action === 'dismiss_out_of_domain' &&
      r.oldFindingStatus &&
      r.oldFindingStatus !== 'dismissed',
  ).length;
  const carAccessKept = rows.filter(
    r =>
      /ô\s*tô|xe\s*máy|kiệt/i.test(r.originalTitle) &&
      r.domainDecision === 'accept',
  ).length;

  console.log('\n--- Domain gate summary ---');
  console.log(`  real_estate accepted: ${reAccepted}`);
  console.log(`  vehicle rejected: ${vehicleRejected}`);
  console.log(`  consumer goods rejected: ${consumerRejected}`);
  console.log(`  unknown needs review: ${unknownReview}`);
  console.log(`  false Finding candidates (out_of_domain + existing): ${falseFindings}`);
  console.log(`  ô tô/kiệt xe máy kept as RE: ${carAccessKept}`);

  // Safety gates for apply readiness
  const unknownDismissed = rows.filter(
    r => r.newClassification === 'unknown' && r.action === 'dismiss',
  ).length;
  const brokerDemandDismissed = rows.filter(
    r => r.brokerActivity === 'demand_request' && r.action === 'dismiss',
  ).length;
  const hasKeep = rows.some(r => (r.action as string) === 'keep');
  const demandLost = rows.filter(
    r =>
      ['buyer', 'renter', 'investor'].includes(r.newClassification) &&
      r.actorRole === 'demand_side' &&
      r.action === 'dismiss',
  ).length;

  console.log('\nSummary counts:', counts);
  console.log('\nSafety checks:');
  console.log(`  unknown auto-dismissed: ${unknownDismissed} (must be 0)`);
  console.log(`  broker_demand dismissed: ${brokerDemandDismissed} (must be 0)`);
  console.log(`  demand-side dismissed: ${demandLost} (must be 0)`);
  console.log(`  has action keep: ${hasKeep} (must be false)`);
  console.log(
    apply
      ? '\nAPPLY complete.'
      : '\nDry-run only. Re-run with --apply ONLY after safety checks pass.',
  );
  await prisma.$disconnect();
}

main().catch(async error => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
