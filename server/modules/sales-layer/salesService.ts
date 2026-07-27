/**
 * Sales Layer orchestrator — Buyer Journey + Memory + Pipeline intelligence.
 * Extends Lead Acquisition; does not create a new CRM.
 */

import { prisma } from '../../prisma';
import {
  readAcquisitionProfile,
  writeAcquisitionProfile,
} from '../lead-acquisition/acquisitionService';
import { detectJourneyStage, journeyToPipeline, migrateH3PipelineStage } from './journeyEngine';
import { computeBuyerKey, findSiblingFindings } from './leadMemory';
import { buildSignal, mergeSignals, scoreBuyerFromSignals } from './signalGraph';
import { evaluateFollowUp } from './followUpEngine';
import { recommendSalesAction } from './salesRecommendation';
import {
  aggregatePipelineValue,
  estimateDealTy,
  formatTy,
  probabilityForStage,
} from './pipelineValue';
import { applyLearningAdjustments } from './learningAdjust';
import { maybeSendCoolingAlert } from './telegramSalesCard';
import type {
  BuyerJourneyStage,
  LeadTimelineEvent,
  PipelineValueMetrics,
  SalesLayerProfile,
  SalesPipelineStage,
  StageHistoryEntry,
} from './types';
import { PIPELINE_RANK, SALES_PIPELINE_STAGES } from './types';
import type { LearningOutcome } from '../lead-acquisition/types';

const SALES_KEY = 'salesLayer';

export function readSalesProfile(extractedData: unknown): SalesLayerProfile | null {
  if (!extractedData || typeof extractedData !== 'object' || Array.isArray(extractedData)) {
    return null;
  }
  const raw = (extractedData as Record<string, unknown>)[SALES_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Partial<SalesLayerProfile>;
  if (p.version !== 'h35_v1' || typeof p.findingId !== 'string') return null;
  return p as SalesLayerProfile;
}

export function writeSalesProfile(extracted: Record<string, unknown>, profile: SalesLayerProfile): void {
  extracted[SALES_KEY] = profile;
}

function pushHistory(
  history: StageHistoryEntry[],
  from: SalesPipelineStage | BuyerJourneyStage | null,
  to: SalesPipelineStage | BuyerJourneyStage,
  reason?: string,
  actor?: string | null,
): StageHistoryEntry[] {
  if (from === to) return history;
  return [
    ...history,
    { at: new Date().toISOString(), from, to, reason: reason || null, actor: actor || null },
  ].slice(-30);
}

function pushTimeline(
  events: LeadTimelineEvent[],
  kind: string,
  label: string,
  detail?: string | null,
  actor?: string | null,
): LeadTimelineEvent[] {
  return [
    ...events,
    {
      at: new Date().toISOString(),
      kind,
      label,
      detail: detail || null,
      actor: actor || null,
    },
  ].slice(-50);
}

export async function processSalesLayer(input: {
  findingId: string;
  notifyFollowUp?: boolean;
}): Promise<SalesLayerProfile | null> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: input.findingId },
    include: {
      scannedContent: { select: { contentText: true, companyId: true } },
      source: { select: { id: true, name: true, type: true } },
    },
  });
  if (!finding) return null;
  if (finding.status === 'dismissed' || finding.status === 'duplicate') return null;

  const text = [finding.title, finding.summary, finding.scannedContent?.contentText]
    .filter(Boolean)
    .join('\n');
  const acq = readAcquisitionProfile(finding.extractedData);
  const existing = readSalesProfile(finding.extractedData);

  const buyerKey = computeBuyerKey({
    companyId: finding.companyId,
    primaryPhone: finding.primaryPhone,
    personName: finding.personName,
    findingId: finding.id,
  });

  const siblings = await findSiblingFindings({
    companyId: finding.companyId,
    primaryPhone: finding.primaryPhone,
    personName: finding.personName,
    findingId: finding.id,
  });

  const canonicalFindingId =
    existing?.canonicalFindingId ||
    (siblings.length
      ? [...siblings].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0].id
      : finding.id);

  const signal = buildSignal({
    findingId: finding.id,
    text,
    sourceType: finding.source?.type,
    sourceId: finding.sourceId,
    sourceName: finding.source?.name,
    findingType: finding.type,
    at: finding.createdAt.toISOString(),
  });

  let signals = mergeSignals(existing?.signals || [], [signal]);
  // Absorb sibling signals lightly
  for (const sib of siblings.slice(0, 8)) {
    const sibSales = readSalesProfile(sib.extractedData);
    if (sibSales?.signals?.length) signals = mergeSignals(signals, sibSales.signals);
    else {
      signals = mergeSignals(signals, [
        buildSignal({
          findingId: sib.id,
          text: sib.title,
          sourceId: sib.sourceId,
          at: sib.createdAt.toISOString(),
        }),
      ]);
    }
  }

  const scored = scoreBuyerFromSignals(signals);
  const journeyDetect = detectJourneyStage({
    text,
    previous: existing?.journeyStage || null,
    signalKinds: scored.kinds,
  });

  let journeyStage = journeyDetect.stage;
  let pipelineStage: SalesPipelineStage =
    existing?.pipelineStage ||
    (acq ? migrateH3PipelineStage(acq.pipelineStage) : journeyToPipeline(journeyStage));

  // Auto-advance pipeline from journey (never regress unless closed)
  const fromJourney = journeyToPipeline(journeyStage);
  if (
    pipelineStage !== 'won' &&
    pipelineStage !== 'lost' &&
    PIPELINE_RANK[fromJourney] > PIPELINE_RANK[pipelineStage]
  ) {
    pipelineStage = fromJourney;
  }

  // Acquisition VIP/qualified boost
  if (acq?.isVip && PIPELINE_RANK[pipelineStage] < PIPELINE_RANK.qualified) {
    pipelineStage = 'qualified';
  }

  const dealTy = estimateDealTy({
    budgetMin: finding.budgetMin,
    budgetMax: finding.budgetMax,
    askingPrice: finding.askingPrice,
  });
  const learningBoost = existing?.learningAdjust?.scoreBoost || 0;
  const confidencePct = Math.max(
    20,
    Math.min(
      99,
      Math.round(
        (acq?.intent.confidence ?? 0.4) * 100 +
          scored.engagementScore * 0.15 +
          learningBoost,
      ),
    ),
  );

  const followUp = evaluateFollowUp({
    signals,
    pipelineStage,
    lastActivityAt: scored.lastActivityAt,
  });

  const recommendation = recommendSalesAction({
    confidencePct,
    journeyStage,
    pipelineStage,
    followUp,
    hasPhone: Boolean(finding.primaryPhone),
    hasBudget: finding.budgetMin != null || finding.budgetMax != null || dealTy != null,
    hasLocation: Boolean(finding.primaryLocation),
    timelineUrgent:
      acq?.timeline === 'buying_today' || acq?.timeline === 'within_7_days',
  });

  let stageHistory = existing?.stageHistory || [];
  stageHistory = pushHistory(
    stageHistory,
    existing?.pipelineStage || null,
    pipelineStage,
    journeyDetect.reasons[0],
    'ai',
  );
  stageHistory = pushHistory(
    stageHistory,
    existing?.journeyStage || null,
    journeyStage,
    'journey',
    'ai',
  );

  let timeline = existing?.timeline || [];
  if (!existing) {
    timeline = pushTimeline(timeline, 'detected', 'Detected', finding.title?.slice(0, 80));
  }
  timeline = pushTimeline(
    timeline,
    signal.kind,
    signal.kind,
    signal.summary,
    'system',
  );
  if (existing?.journeyStage !== journeyStage) {
    timeline = pushTimeline(timeline, 'journey', journeyStage, journeyDetect.reasons.join(', '), 'ai');
  }

  const profile: SalesLayerProfile = {
    version: 'h35_v1',
    findingId: finding.id,
    buyerKey,
    canonicalFindingId,
    mergedFindingIds: [
      ...new Set([finding.id, canonicalFindingId, ...siblings.map(s => s.id), ...(existing?.mergedFindingIds || [])]),
    ].slice(0, 30),
    journeyStage,
    pipelineStage,
    signals,
    timeline,
    stageHistory,
    owner: existing?.owner || null,
    expectedCloseAt: existing?.expectedCloseAt || null,
    probability: probabilityForStage(pipelineStage, existing?.probability),
    expectedDealTy: dealTy,
    recommendation,
    followUp,
    learningAdjust: existing?.learningAdjust || null,
    updatedAt: new Date().toISOString(),
  };

  // Sync H3 pipeline stage for Lead Center backward compat
  const extracted =
    finding.extractedData && typeof finding.extractedData === 'object' && !Array.isArray(finding.extractedData)
      ? { ...(finding.extractedData as Record<string, unknown>) }
      : {};
  writeSalesProfile(extracted, profile);
  if (acq) {
    const mappedH3 =
      pipelineStage === 'detected'
        ? 'candidate'
        : pipelineStage === 'appointment'
          ? 'interested'
          : pipelineStage === 'won' || pipelineStage === 'lost' || pipelineStage === 'qualified' || pipelineStage === 'assigned' || pipelineStage === 'contacted' || pipelineStage === 'negotiating'
            ? pipelineStage
            : acq.pipelineStage;
    acq.pipelineStage = mappedH3 as typeof acq.pipelineStage;
    acq.updatedAt = profile.updatedAt;
    writeAcquisitionProfile(extracted, acq);
  }

  await prisma.agentFinding.update({
    where: { id: finding.id },
    data: {
      extractedData: extracted as object,
      reasons: [
        ...((Array.isArray(finding.reasons) ? finding.reasons : []) as string[]).slice(0, 6),
        `sales_journey:${journeyStage}`,
        `sales_pipeline:${pipelineStage}`,
        followUp.needsFollowUp ? 'sales:need_followup' : 'sales:ok',
      ] as object,
    },
  });

  // Soft-link siblings to same buyerKey
  for (const sib of siblings.slice(0, 5)) {
    try {
      const sibRow = await prisma.agentFinding.findUnique({ where: { id: sib.id } });
      if (!sibRow) continue;
      const ed =
        sibRow.extractedData && typeof sibRow.extractedData === 'object' && !Array.isArray(sibRow.extractedData)
          ? { ...(sibRow.extractedData as Record<string, unknown>) }
          : {};
      const sibProfile = readSalesProfile(ed) || {
        ...profile,
        findingId: sib.id,
        signals: readSalesProfile(ed)?.signals || [],
      };
      sibProfile.buyerKey = buyerKey;
      sibProfile.canonicalFindingId = canonicalFindingId;
      sibProfile.mergedFindingIds = profile.mergedFindingIds;
      writeSalesProfile(ed, sibProfile);
      await prisma.agentFinding.update({
        where: { id: sib.id },
        data: { extractedData: ed as object },
      });
    } catch {
      /* ignore sibling write errors */
    }
  }

  if (input.notifyFollowUp && followUp.needsFollowUp && followUp.coolingHours >= 72) {
    void maybeSendCoolingAlert({ findingId: finding.id, profile, confidencePct }).catch(() => undefined);
  }

  return profile;
}

export function enqueueSalesLayer(findingId: string): void {
  void processSalesLayer({ findingId, notifyFollowUp: true }).catch(err => {
    console.warn('[sales-layer] process failed:', findingId, err);
  });
}

export type SalesActionKind =
  | 'call'
  | 'contact'
  | 'assign'
  | 'ignore'
  | 'open'
  | 'follow_up'
  | 'source';

/** Persist sales operator action onto Sales Layer timeline (and pipeline when relevant). */
export async function recordSalesAction(input: {
  findingId: string;
  action: SalesActionKind;
  actor?: string | null;
  result?: string | null;
  owner?: string | null;
}): Promise<SalesLayerProfile | null> {
  let profile = await processSalesLayer({ findingId: input.findingId, notifyFollowUp: false });
  if (!profile) return null;

  const finding = await prisma.agentFinding.findUnique({ where: { id: input.findingId } });
  if (!finding) return null;

  const actor = input.actor || 'telegram';
  const labels: Record<SalesActionKind, string> = {
    call: 'Call',
    contact: 'Contact',
    assign: 'Assign',
    ignore: 'Ignore',
    open: 'Open Lead',
    follow_up: 'Follow-up',
    source: 'Open Source',
  };

  profile.timeline = pushTimeline(
    profile.timeline,
    input.action,
    labels[input.action],
    input.result || null,
    actor,
  );

  if (input.action === 'call' || input.action === 'contact') {
    const from = profile.pipelineStage;
    if (PIPELINE_RANK[from] < PIPELINE_RANK.contacted && from !== 'won' && from !== 'lost') {
      profile.pipelineStage = 'contacted';
      profile.journeyStage =
        profile.journeyStage === 'closed_won' || profile.journeyStage === 'closed_lost'
          ? profile.journeyStage
          : 'contacted';
      profile.stageHistory = pushHistory(
        profile.stageHistory,
        from,
        'contacted',
        input.action,
        actor,
      );
      profile.probability = probabilityForStage('contacted', profile.probability);
    }
  }

  if (input.action === 'assign') {
    const from = profile.pipelineStage;
    if (from !== 'won' && from !== 'lost') {
      profile.pipelineStage = 'assigned';
      profile.owner = input.owner || actor;
      profile.stageHistory = pushHistory(profile.stageHistory, from, 'assigned', 'assign', actor);
      profile.probability = probabilityForStage('assigned', profile.probability);
    }
  }

  if (input.action === 'ignore') {
    const from = profile.pipelineStage;
    profile.pipelineStage = 'lost';
    profile.journeyStage = 'closed_lost';
    profile.stageHistory = pushHistory(profile.stageHistory, from, 'lost', 'ignore', actor);
    profile.probability = 0;
  }

  profile.updatedAt = new Date().toISOString();

  const extracted =
    finding.extractedData && typeof finding.extractedData === 'object' && !Array.isArray(finding.extractedData)
      ? { ...(finding.extractedData as Record<string, unknown>) }
      : {};
  writeSalesProfile(extracted, profile);

  await prisma.agentFinding.update({
    where: { id: finding.id },
    data: {
      extractedData: extracted as object,
      ...(input.action === 'ignore'
        ? {
            status: 'dismissed',
            dismissedAt: new Date(),
            dismissedBy: actor,
            dismissReason: 'sales_ignore',
          }
        : {}),
    },
  });

  return profile;
}

export async function updateSalesPipelineStage(input: {
  findingId: string;
  stage: SalesPipelineStage;
  actor?: string | null;
  owner?: string | null;
  expectedCloseAt?: string | null;
  probability?: number | null;
}): Promise<SalesLayerProfile | null> {
  if (!SALES_PIPELINE_STAGES.includes(input.stage)) return null;
  let profile = await processSalesLayer({ findingId: input.findingId, notifyFollowUp: false });
  if (!profile) return null;

  const finding = await prisma.agentFinding.findUnique({ where: { id: input.findingId } });
  if (!finding) return null;

  const from = profile.pipelineStage;
  profile.pipelineStage = input.stage;
  if (input.stage === 'won') profile.journeyStage = 'closed_won';
  if (input.stage === 'lost') profile.journeyStage = 'closed_lost';
  if (input.owner !== undefined) profile.owner = input.owner;
  if (input.expectedCloseAt !== undefined) profile.expectedCloseAt = input.expectedCloseAt;
  if (input.probability != null) profile.probability = Math.max(0, Math.min(1, input.probability));
  else profile.probability = probabilityForStage(input.stage);
  profile.stageHistory = pushHistory(profile.stageHistory, from, input.stage, 'manual', input.actor);
  profile.timeline = pushTimeline(
    profile.timeline,
    'pipeline',
    input.stage,
    `Moved by ${input.actor || 'admin'}`,
    input.actor,
  );
  profile.updatedAt = new Date().toISOString();

  const extracted =
    finding.extractedData && typeof finding.extractedData === 'object' && !Array.isArray(finding.extractedData)
      ? { ...(finding.extractedData as Record<string, unknown>) }
      : {};
  writeSalesProfile(extracted, profile);

  const acq = readAcquisitionProfile(extracted);
  if (acq) {
    acq.pipelineStage = (
      input.stage === 'detected'
        ? 'candidate'
        : input.stage === 'appointment'
          ? 'interested'
          : input.stage
    ) as typeof acq.pipelineStage;
    writeAcquisitionProfile(extracted, acq);
  }

  await prisma.agentFinding.update({
    where: { id: finding.id },
    data: {
      extractedData: extracted as object,
      status: input.stage === 'won' ? 'won' : input.stage === 'lost' ? 'dismissed' : finding.status,
    },
  });

  return profile;
}

export async function recordSalesLearning(input: {
  findingId: string;
  outcome: LearningOutcome;
  note?: string;
  actor?: string | null;
}): Promise<SalesLayerProfile | null> {
  const { recordLeadLearning } = await import('../lead-acquisition/learningEngine');
  await recordLeadLearning({
    findingId: input.findingId,
    outcome: input.outcome,
    note: input.note,
    actor: input.actor,
  });

  let profile = await processSalesLayer({ findingId: input.findingId, notifyFollowUp: false });
  if (!profile) return null;
  profile = applyLearningAdjustments(profile, input.outcome);

  const finding = await prisma.agentFinding.findUnique({ where: { id: input.findingId } });
  if (!finding) return null;
  const extracted =
    finding.extractedData && typeof finding.extractedData === 'object' && !Array.isArray(finding.extractedData)
      ? { ...(finding.extractedData as Record<string, unknown>) }
      : {};
  writeSalesProfile(extracted, profile);
  await prisma.agentFinding.update({
    where: { id: finding.id },
    data: { extractedData: extracted as object },
  });
  return profile;
}

export async function listSalesPipeline(input?: {
  companyId?: string | null;
  limit?: number;
}): Promise<
  Record<
    SalesPipelineStage,
    Array<{
      findingId: string;
      title: string;
      sales: SalesLayerProfile;
      confidencePct: number;
      campaignName: string | null;
    }>
  >
> {
  const board = Object.fromEntries(SALES_PIPELINE_STAGES.map(s => [s, []])) as Record<
    SalesPipelineStage,
    Array<{
      findingId: string;
      title: string;
      sales: SalesLayerProfile;
      confidencePct: number;
      campaignName: string | null;
    }>
  >;

  const rows = await prisma.agentFinding.findMany({
    where: {
      ...(input?.companyId ? { companyId: input.companyId } : {}),
      status: { notIn: ['duplicate'] },
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(800, Math.max(50, (input?.limit ?? 200) * 3)),
    select: { id: true, title: true, extractedData: true, finalScore: true },
  });

  const lim = input?.limit ?? 200;
  let placed = 0;
  let hydrated = 0;
  const HYDRATE_BUDGET = 40;
  for (const row of rows) {
    if (placed >= lim) break;
    let sales = readSalesProfile(row.extractedData);
    let acq = readAcquisitionProfile(row.extractedData);
    if (!sales) {
      if (hydrated >= HYDRATE_BUDGET) continue;
      try {
        const { processLeadAcquisition } = await import('../lead-acquisition');
        acq =
          (await processLeadAcquisition({
            findingId: row.id,
            notifyTelegram: false,
          })) || acq;
        hydrated += 1;
        if (!acq?.isBuyer) continue;
        sales = await processSalesLayer({ findingId: row.id, notifyFollowUp: false });
      } catch {
        continue;
      }
      if (!sales) continue;
    }
    const confidencePct = Math.round((acq?.intent.confidence ?? 0.5) * 100);
    board[sales.pipelineStage].push({
      findingId: row.id,
      title: row.title,
      sales,
      confidencePct,
      campaignName: acq?.campaignMatch.campaignName || null,
    });
    placed += 1;
  }
  return board;
}

export async function getSalesPipelineMetrics(input?: {
  companyId?: string | null;
  sinceHours?: number;
}): Promise<PipelineValueMetrics> {
  const since = new Date(Date.now() - (input?.sinceHours ?? 24 * 30) * 3600_000);
  const rows = await prisma.agentFinding.findMany({
    where: {
      ...(input?.companyId ? { companyId: input.companyId } : {}),
      updatedAt: { gte: since },
      status: { notIn: ['duplicate'] },
    },
    take: 2000,
    select: {
      id: true,
      createdAt: true,
      budgetMin: true,
      budgetMax: true,
      askingPrice: true,
      sourceId: true,
      extractedData: true,
      source: { select: { id: true, name: true } },
    },
  });

  const items: Parameters<typeof aggregatePipelineValue>[0] = [];
  for (const row of rows) {
    const sales = readSalesProfile(row.extractedData);
    if (!sales) continue;
    const acq = readAcquisitionProfile(row.extractedData);
    items.push({
      profile: sales,
      budgetMin: row.budgetMin,
      budgetMax: row.budgetMax,
      askingPrice: row.askingPrice,
      campaignId: acq?.campaignMatch.campaignId,
      campaignName: acq?.campaignMatch.campaignName,
      sourceId: row.sourceId,
      sourceName: row.source?.name,
      createdAt: row.createdAt,
    });
  }
  return aggregatePipelineValue(items);
}

export function formatSalesDailyBriefing(metrics: PipelineValueMetrics): string {
  return [
    '📈 Sales Pipeline',
    '',
    `Detected  ${metrics.detected}`,
    `Qualified  ${metrics.qualified}`,
    `Negotiating  ${metrics.negotiating}`,
    `Won  ${metrics.won}`,
    '',
    `Pipeline Value  ${formatTy(metrics.pipelineValueTy)}`,
    `Expected Revenue  ${formatTy(metrics.expectedRevenueTy)}`,
    '',
    `Need Follow-up  ${metrics.needFollowUp}`,
    `Urgent Buyers  ${metrics.urgentBuyers}`,
  ].join('\n');
}
