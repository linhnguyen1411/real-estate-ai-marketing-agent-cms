/**
 * Lead Acquisition Engine — orchestrator.
 * Scanner finding = input; Buyer lead profile = output.
 * Rule + Intent Pattern + Classifier only (no Gemini dependency).
 */

import { prisma } from '../../prisma';
import { detectBuyerIntent, isBuyerIntent } from './intentEngine';
import { classifyBuyerPersona } from './personaEngine';
import { predictBuyingTimeline } from './buyerTimeline';
import { matchLeadToCampaign } from './campaignMatcher';
import { computeLeadPriority } from './priorityEngine';
import { suggestLeadAction } from './actionEngine';
import type {
  LeadAcquisitionMetrics,
  LeadAcquisitionProfile,
  LeadPipelineStage,
} from './types';
import { maybeSendBuyerAlert } from './telegramBuyerAlert';

const PROFILE_KEY = 'leadAcquisition';

export function readAcquisitionProfile(extractedData: unknown): LeadAcquisitionProfile | null {
  if (!extractedData || typeof extractedData !== 'object' || Array.isArray(extractedData)) {
    return null;
  }
  const raw = (extractedData as Record<string, unknown>)[PROFILE_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Partial<LeadAcquisitionProfile>;
  if (p.version !== 'h3_v1' || typeof p.findingId !== 'string') return null;
  return p as LeadAcquisitionProfile;
}

export function writeAcquisitionProfile(
  extracted: Record<string, unknown>,
  profile: LeadAcquisitionProfile,
): void {
  extracted[PROFILE_KEY] = profile;
}

function inferPipelineStage(profile: Omit<LeadAcquisitionProfile, 'pipelineStage' | 'updatedAt'> & {
  pipelineStage?: LeadPipelineStage;
}): LeadPipelineStage {
  if (profile.pipelineStage && profile.pipelineStage !== 'candidate') return profile.pipelineStage;
  if (!profile.isBuyer) return 'candidate';
  if (profile.isVip || profile.priority.finalScore >= 80) return 'qualified';
  if (profile.priority.finalScore >= 55) return 'qualified';
  return 'candidate';
}

export async function processLeadAcquisition(input: {
  findingId: string;
  /** When true, also emit Telegram Buyer Alert for VIP/ready buyers */
  notifyTelegram?: boolean;
}): Promise<LeadAcquisitionProfile | null> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: input.findingId },
    include: {
      scannedContent: { select: { contentText: true, companyId: true } },
      source: { select: { id: true, name: true } },
    },
  });
  if (!finding) return null;
  if (finding.status === 'dismissed' || finding.status === 'duplicate') return null;

  const text = [finding.title, finding.summary, finding.scannedContent?.contentText]
    .filter(Boolean)
    .join('\n');

  const existing = readAcquisitionProfile(finding.extractedData);
  const intent = detectBuyerIntent(text);
  const persona = classifyBuyerPersona(text);
  const timeline = predictBuyingTimeline({ text, intent: intent.intent });
  const campaignMatch = await matchLeadToCampaign({
    companyId: finding.companyId || finding.scannedContent?.companyId,
    text,
    area: finding.primaryLocation,
  });
  const hasPhone = Boolean(finding.primaryPhone);
  const hasBudget = finding.budgetMin != null || finding.budgetMax != null;
  const priority = computeLeadPriority({
    intent,
    timeline,
    campaignMatch,
    keywordScore: finding.keywordScore,
    aiScore: finding.aiScore,
    hasPhone,
    hasBudget,
    areaHint: finding.primaryLocation,
    text,
  });
  const action = suggestLeadAction({ intent, timeline, priority, hasPhone });
  const buyer = isBuyerIntent(intent.intent);
  const vip =
    buyer &&
    (intent.intent === 'ready_buyer' ||
      priority.finalScore >= 85 ||
      (campaignMatch.matchScore >= 50 && priority.finalScore >= 70));

  const draft = {
    version: 'h3_v1' as const,
    findingId: finding.id,
    intent,
    persona,
    timeline,
    campaignMatch,
    priority,
    action,
    isBuyer: buyer,
    isVip: vip,
    learningOutcome: existing?.learningOutcome ?? null,
    pipelineStage: existing?.pipelineStage,
  };

  const profile: LeadAcquisitionProfile = {
    ...draft,
    pipelineStage: inferPipelineStage(draft),
    updatedAt: new Date().toISOString(),
  };

  const extracted =
    finding.extractedData && typeof finding.extractedData === 'object' && !Array.isArray(finding.extractedData)
      ? { ...(finding.extractedData as Record<string, unknown>) }
      : {};
  writeAcquisitionProfile(extracted, profile);

  // Soft-boost finalScore toward acquisition score for buyers (don't tank existing score)
  const nextFinal =
    buyer && profile.priority.finalScore > (finding.finalScore ?? finding.score ?? 0)
      ? profile.priority.finalScore
      : finding.finalScore ?? finding.score;

  await prisma.agentFinding.update({
    where: { id: finding.id },
    data: {
      extractedData: extracted as object,
      ...(nextFinal != null
        ? {
            finalScore: nextFinal,
            score: Math.max(finding.score ?? 0, nextFinal),
          }
        : {}),
      reasons: [
        ...((Array.isArray(finding.reasons) ? finding.reasons : []) as string[]).slice(0, 8),
        `acq_intent:${intent.intent}`,
        `acq_persona:${persona.persona}`,
        `acq_timeline:${timeline}`,
        vip ? 'acq:vip' : buyer ? 'acq:buyer' : 'acq:non_buyer',
      ] as object,
    },
  });

  if (input.notifyTelegram && (vip || (buyer && profile.priority.finalScore >= 70))) {
    void maybeSendBuyerAlert({ findingId: finding.id, profile }).catch(err => {
      console.warn('[lead-acquisition] buyer alert failed:', err);
    });
  }

  return profile;
}

export async function updateLeadPipelineStage(input: {
  findingId: string;
  stage: LeadPipelineStage;
  actor?: string | null;
}): Promise<LeadAcquisitionProfile | null> {
  const finding = await prisma.agentFinding.findUnique({ where: { id: input.findingId } });
  if (!finding) return null;
  const profile = readAcquisitionProfile(finding.extractedData);
  if (!profile) {
    const created = await processLeadAcquisition({ findingId: input.findingId });
    if (!created) return null;
    return updateLeadPipelineStage(input);
  }

  profile.pipelineStage = input.stage;
  profile.updatedAt = new Date().toISOString();
  const extracted =
    finding.extractedData && typeof finding.extractedData === 'object' && !Array.isArray(finding.extractedData)
      ? { ...(finding.extractedData as Record<string, unknown>) }
      : {};
  writeAcquisitionProfile(extracted, profile);
  (extracted as Record<string, unknown>).pipelineUpdate = {
    stage: input.stage,
    actor: input.actor || null,
    at: profile.updatedAt,
  };

  await prisma.agentFinding.update({
    where: { id: finding.id },
    data: {
      extractedData: extracted as object,
      status:
        input.stage === 'won'
          ? 'won'
          : input.stage === 'lost'
            ? 'dismissed'
            : finding.status,
    },
  });
  return profile;
}

export async function listLeadPipeline(input?: {
  companyId?: string | null;
  limit?: number;
}): Promise<Record<LeadPipelineStage, Array<{ findingId: string; title: string; profile: LeadAcquisitionProfile }>>> {
  const stages: LeadPipelineStage[] = [
    'candidate',
    'qualified',
    'assigned',
    'contacted',
    'interested',
    'negotiating',
    'won',
    'lost',
  ];
  const board = Object.fromEntries(stages.map(s => [s, []])) as Record<
    LeadPipelineStage,
    Array<{ findingId: string; title: string; profile: LeadAcquisitionProfile }>
  >;

  const rows = await prisma.agentFinding.findMany({
    where: {
      ...(input?.companyId ? { companyId: input.companyId } : {}),
      status: { notIn: ['duplicate'] },
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(800, Math.max(50, (input?.limit ?? 200) * 3)),
    select: { id: true, title: true, extractedData: true },
  });

  const lim = input?.limit ?? 200;
  let placed = 0;
  for (const row of rows) {
    if (placed >= lim) break;
    const profile = readAcquisitionProfile(row.extractedData);
    if (!profile) continue;
    const stage = profile.pipelineStage || 'candidate';
    board[stage].push({ findingId: row.id, title: row.title, profile });
    placed += 1;
  }
  return board;
}

export async function getLeadAcquisitionMetrics(input?: {
  companyId?: string | null;
  sinceHours?: number;
}): Promise<LeadAcquisitionMetrics> {
  const since = new Date(Date.now() - (input?.sinceHours ?? 24) * 3600_000);
  const rows = await prisma.agentFinding.findMany({
    where: {
      ...(input?.companyId ? { companyId: input.companyId } : {}),
      updatedAt: { gte: since },
      status: { notIn: ['duplicate'] },
    },
    select: {
      id: true,
      status: true,
      sourceId: true,
      extractedData: true,
      source: { select: { id: true, name: true } },
    },
    take: 2000,
  });

  let buyerCandidates = 0;
  let qualifiedBuyers = 0;
  let vipBuyers = 0;
  let assigned = 0;
  let converted = 0;
  let contacted = 0;
  let lost = 0;
  const byCampaign = new Map<string, { campaignId: string; name: string; leads: number; vip: number }>();
  const bySource = new Map<string, { sourceId: string; name: string; leads: number }>();

  for (const row of rows) {
    const profile = readAcquisitionProfile(row.extractedData);
    if (!profile?.isBuyer) continue;
    buyerCandidates += 1;
    if (profile.isVip) vipBuyers += 1;
    if (
      profile.pipelineStage === 'qualified' ||
      profile.pipelineStage === 'assigned' ||
      profile.pipelineStage === 'contacted' ||
      profile.pipelineStage === 'interested' ||
      profile.pipelineStage === 'negotiating' ||
      profile.pipelineStage === 'won'
    ) {
      qualifiedBuyers += 1;
    }
    if (profile.pipelineStage === 'assigned') assigned += 1;
    if (profile.pipelineStage === 'contacted' || profile.pipelineStage === 'interested') contacted += 1;
    if (profile.pipelineStage === 'won' || row.status === 'won') converted += 1;
    if (profile.pipelineStage === 'lost') lost += 1;

    const cid = profile.campaignMatch.campaignId || 'unmatched';
    const cname = profile.campaignMatch.campaignName || 'Unmatched';
    const c = byCampaign.get(cid) || { campaignId: cid, name: cname, leads: 0, vip: 0 };
    c.leads += 1;
    if (profile.isVip) c.vip += 1;
    byCampaign.set(cid, c);

    const sid = row.sourceId || 'unknown';
    const s = bySource.get(sid) || {
      sourceId: sid,
      name: row.source?.name || sid,
      leads: 0,
    };
    s.leads += 1;
    bySource.set(sid, s);
  }

  return {
    buyerCandidates,
    qualifiedBuyers,
    vipBuyers,
    assigned,
    converted,
    contacted,
    lost,
    byCampaign: [...byCampaign.values()].sort((a, b) => b.leads - a.leads).slice(0, 20),
    bySource: [...bySource.values()].sort((a, b) => b.leads - a.leads).slice(0, 20),
  };
}

/** Fire-and-forget after RAW finding create / enrichment */
export function enqueueLeadAcquisition(findingId: string, notifyTelegram = true): void {
  void processLeadAcquisition({ findingId, notifyTelegram }).catch(err => {
    console.warn('[lead-acquisition] process failed:', findingId, err);
  });
}
