/**
 * Campaign Acquisition Bridge — fulfill requests via public façades only (ADR-007).
 * Does not import Scanner Runtime / Browser / Fleet / Queue claim internals.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../prisma';
import { enqueueSourceScan } from '../../agent/agentJobService';
import { getCampaign } from '../planning/campaignRuntime';
import type { LivingCampaign } from '../planning/types';
import { buildAcquisitionIdempotencyKey } from './idempotency';
import type {
  AcquisitionLifecycleStatus,
  CampaignAcquisitionRequest,
  CampaignAcquisitionResult,
  CampaignAcquisitionSnapshot,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function readRequests(campaign: LivingCampaign): CampaignAcquisitionRequest[] {
  const state = campaign.state as LivingCampaign['state'] & {
    acquisitionRequests?: CampaignAcquisitionRequest[];
  };
  return Array.isArray(state.acquisitionRequests) ? state.acquisitionRequests : [];
}

async function writeRequests(
  campaignId: string,
  requests: CampaignAcquisitionRequest[],
): Promise<LivingCampaign | null> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return null;
  const nextState = {
    ...campaign.state,
    acquisitionRequests: requests.slice(-10),
  };
  await prisma.aiSalesCampaign.update({
    where: { id: campaignId },
    data: { state: nextState as object },
  });
  return getCampaign(campaignId);
}

function keywordsFromCampaign(campaign: LivingCampaign): string[] {
  const set = new Set<string>();
  const push = (v?: string | null) => {
    String(v || '')
      .split(/[\s,/|·•\-\[\]()]+/)
      .map(x => x.trim())
      .filter(x => x.length >= 3 && !/^h2[\d._-]*/i.test(x) && !/^\d+$/.test(x))
      .forEach(k => set.add(k));
  };
  push(campaign.propertyHint);
  push(campaign.name);
  push(campaign.goal);
  for (const m of campaign.state.missions || []) {
    push(m.name);
    push(m.areaHint);
    push(m.persona);
  }
  for (const k of campaign.state.research?.topKeywords || []) push(k);
  return Array.from(set).slice(0, 24);
}

function latestRequest(requests: CampaignAcquisitionRequest[]): CampaignAcquisitionRequest | null {
  if (!requests.length) return null;
  return [...requests].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
}

export function toAcquisitionSnapshot(
  request: CampaignAcquisitionRequest | null,
): CampaignAcquisitionSnapshot {
  if (!request) {
    return {
      request: null,
      status: 'NOT_STARTED',
      sources: 0,
      postsScanned: 0,
      candidates: 0,
      qualified: 0,
      hot: 0,
      lastRunAt: null,
      coverage: null,
      errors: [],
      nextAction: 'Approve campaign để mở Acquisition Request',
    };
  }
  const r = request.result;
  return {
    request,
    status: request.status,
    sources: r?.sourcesScanned ?? request.sourceIds.length,
    postsScanned: r?.postsSeen ?? 0,
    candidates: r?.candidates ?? 0,
    qualified: r?.qualified ?? 0,
    hot: r?.hot ?? 0,
    lastRunAt: request.completedAt || request.updatedAt,
    coverage: r?.coverage ?? null,
    errors: r?.errors?.length ? r.errors : request.lastError ? [request.lastError] : [],
    nextAction: r?.nextAction ?? (request.status === 'BLOCKED' ? 'Thêm AgentSource active' : null),
  };
}

/** Create or reuse acquisition request after Planning Approval. */
export async function ensureAcquisitionRequest(input: {
  campaignId: string;
  actor?: string | null;
}): Promise<{ campaign: LivingCampaign; request: CampaignAcquisitionRequest; reused: boolean }> {
  const campaign = await getCampaign(input.campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${input.campaignId}`);

  const missionProposalId = campaign.state.missions[0]?.id || null;
  const idempotencyKey = buildAcquisitionIdempotencyKey({
    campaignId: campaign.id,
    missionProposalId,
    goal: campaign.goal,
    targetProperty: campaign.propertyHint,
  });

  const existing = readRequests(campaign);
  const hit = existing.find(r => r.idempotencyKey === idempotencyKey);
  if (hit && !['FAILED', 'CANCELLED', 'BLOCKED'].includes(hit.status)) {
    return { campaign, request: hit, reused: true };
  }

  const request: CampaignAcquisitionRequest = {
    id: randomUUID().replace(/-/g, '').slice(0, 24),
    campaignId: campaign.id,
    missionProposalId,
    goal: campaign.goal,
    keywords: keywordsFromCampaign(campaign),
    sourceTypes: ['facebook_group', 'facebook', 'website'],
    targetProperty: campaign.propertyHint || null,
    location: campaign.state.missions[0]?.areaHint || null,
    budget: campaign.state.budget || null,
    priority: campaign.priority,
    requestedBy: input.actor || campaign.owner || 'campaign-bridge',
    approvalState: 'planning_approved',
    status: 'APPROVED',
    idempotencyKey,
    attempt: (hit?.attempt || 0) + 1,
    jobIds: [],
    sourceIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
    lastError: null,
    result: null,
  };

  const next = [...existing.filter(r => r.idempotencyKey !== idempotencyKey), request];
  const saved = await writeRequests(campaign.id, next);
  if (!saved) throw new Error('Failed to persist acquisition request');
  return { campaign: saved, request, reused: false };
}

async function selectSources(input: {
  companyId: string | null;
  keywords: string[];
  limit?: number;
}): Promise<Array<{ id: string; name: string; type: string; companyId: string | null }>> {
  const rows = await prisma.agentSource.findMany({
    where: {
      status: 'active',
      ...(input.companyId ? { companyId: input.companyId } : {}),
    },
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    take: 40,
    select: { id: true, name: true, type: true, companyId: true, url: true },
  });

  const kw = input.keywords.map(k => k.toLowerCase()).filter(Boolean);
  const scored = rows
    .map(s => {
      const blob = `${s.name} ${s.type} ${s.url}`.toLowerCase();
      let score = 1;
      if (/facebook|group/i.test(s.type) || /facebook\.com/i.test(s.url)) score += 3;
      for (const k of kw) {
        if (k.length >= 3 && blob.includes(k.toLowerCase())) score += 2;
      }
      return { ...s, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, input.limit ?? 8).map(({ id, name, type, companyId }) => ({
    id,
    name,
    type,
    companyId,
  }));
}

async function notifyOps(input: {
  campaignId: string;
  title: string;
  lines: string[];
}): Promise<void> {
  try {
    const { sendNotification } = await import('../../notifications/notificationRouter');
    await sendNotification({
      type: 'planner',
      immediate: true,
      dedupeKey: `acq:${input.campaignId}:${input.title}`,
      text: input.lines.join('\n'),
      payload: {
        entityId: input.campaignId,
        title: input.title,
        summary: input.lines[0],
      },
    });
  } catch {
    /* OPS optional */
  }
}

/** Queue scan jobs via public façade — does not call Scanner Runtime internals. */
export async function queueAcquisitionScans(input: {
  campaignId: string;
  requestId: string;
  actor?: string | null;
}): Promise<CampaignAcquisitionRequest> {
  const campaign = await getCampaign(input.campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${input.campaignId}`);
  const requests = readRequests(campaign);
  const idx = requests.findIndex(r => r.id === input.requestId);
  if (idx < 0) throw new Error(`Acquisition request not found: ${input.requestId}`);
  let req = requests[idx];

  if (['COMPLETED', 'PARTIAL', 'CANCELLED'].includes(req.status) && req.jobIds.length) {
    return req;
  }

  req = {
    ...req,
    status: 'QUEUED',
    updatedAt: nowIso(),
    approvalState: 'planning_approved',
  };
  requests[idx] = req;
  await writeRequests(campaign.id, requests);

  const sources = await selectSources({
    companyId: campaign.companyId,
    keywords: req.keywords,
    limit: 8,
  });

  if (!sources.length) {
    req = {
      ...req,
      status: 'BLOCKED',
      lastError: 'No active AgentSource available',
      updatedAt: nowIso(),
      completedAt: nowIso(),
      result: {
        sourcesScanned: 0,
        postsSeen: 0,
        candidates: 0,
        qualified: 0,
        hot: 0,
        findingIds: [],
        jobIds: [],
        sourceIds: [],
        errors: ['No active sources'],
        coverage: '0 sources',
        nextAction: 'Thêm / activate AgentSource (Facebook group) rồi Approve lại',
        summarizedAt: nowIso(),
      },
    };
    requests[idx] = req;
    await writeRequests(campaign.id, requests);
    await notifyOps({
      campaignId: campaign.id,
      title: 'Acquisition blocked',
      lines: [
        '⛔ Acquisition BLOCKED',
        campaign.name,
        'Không có AgentSource active — không enqueue Scanner.',
      ],
    });
    return req;
  }

  const jobIds: string[] = [];
  const sourceIds: string[] = [];
  const errors: string[] = [];
  req = { ...req, status: 'RUNNING', updatedAt: nowIso() };

  for (const source of sources) {
    try {
      const enq = await enqueueSourceScan({
        sourceId: source.id,
        companyId: source.companyId || campaign.companyId || 'system',
        triggeredByUserId: input.actor || req.requestedBy || 'campaign-bridge',
        missionId: null,
      });
      jobIds.push(enq.jobId);
      sourceIds.push(enq.sourceId);
    } catch (error: unknown) {
      errors.push(
        `${source.name}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 160),
      );
    }
  }

  req = {
    ...req,
    status: jobIds.length ? 'WAITING_RESULTS' : 'FAILED',
    jobIds: [...new Set([...req.jobIds, ...jobIds])],
    sourceIds: [...new Set([...req.sourceIds, ...sourceIds])],
    lastError: errors[0] || null,
    updatedAt: nowIso(),
    completedAt: jobIds.length ? null : nowIso(),
    result: jobIds.length
      ? null
      : {
          sourcesScanned: 0,
          postsSeen: 0,
          candidates: 0,
          qualified: 0,
          hot: 0,
          findingIds: [],
          jobIds: [],
          sourceIds: [],
          errors,
          coverage: 'enqueue failed',
          nextAction: 'Kiểm tra AgentSource / worker',
          summarizedAt: nowIso(),
        },
  };
  requests[idx] = req;
  await writeRequests(campaign.id, requests);

  await notifyOps({
    campaignId: campaign.id,
    title: 'Acquisition queued',
    lines: [
      '🔎 Acquisition QUEUED',
      campaign.name,
      `Sources: ${sourceIds.length}`,
      `Jobs: ${jobIds.length}`,
      errors.length ? `Errors: ${errors.length}` : 'Scanner jobs via public enqueue façade',
    ],
  });

  return req;
}

function textMatch(hay: string, needles: string[]): boolean {
  const h = hay.toLowerCase();
  return needles.some(n => n.length >= 3 && h.includes(n.toLowerCase()));
}

/** Aggregate findings → candidates → qualify via existing Lead/Sales modules. */
export async function summarizeAcquisitionResults(input: {
  campaignId: string;
  requestId?: string | null;
}): Promise<CampaignAcquisitionRequest | null> {
  const campaign = await getCampaign(input.campaignId);
  if (!campaign) return null;
  const requests = readRequests(campaign);
  const idx = input.requestId
    ? requests.findIndex(r => r.id === input.requestId)
    : requests.length
      ? requests.length - 1
      : -1;
  if (idx < 0) return null;
  let req = requests[idx];

  const since = new Date(req.createdAt);
  const sourceFilter = req.sourceIds.length ? { sourceId: { in: req.sourceIds } } : {};
  const findings = await prisma.agentFinding.findMany({
    where: {
      createdAt: { gte: since },
      status: { notIn: ['dismissed', 'duplicate'] },
      ...sourceFilter,
    },
    orderBy: { createdAt: 'desc' },
    take: 80,
    select: {
      id: true,
      title: true,
      summary: true,
      primaryLocation: true,
      propertyType: true,
      finalScore: true,
      classification: true,
      intent: true,
      extractedData: true,
      sourceId: true,
    },
  });

  const needles = [
    ...req.keywords,
    req.targetProperty || '',
    campaign.propertyHint || '',
    campaign.name || '',
  ].filter(Boolean);

  const matched = findings.filter(f =>
    textMatch(
      `${f.title} ${f.summary} ${f.primaryLocation || ''} ${f.propertyType || ''} ${f.intent || ''}`,
      needles,
    ),
  );

  // If keyword match empty but we have source-scoped findings, keep them as weak candidates
  const candidates = matched.length ? matched : req.sourceIds.length ? findings.slice(0, 20) : [];

  let qualified = 0;
  let hot = 0;
  const findingIds: string[] = [];
  const errors: string[] = [...(req.result?.errors || [])];

  const { processLeadAcquisition, readAcquisitionProfile } = await import('../lead-acquisition');
  const { processSalesLayer } = await import('../sales-layer');
  const { shouldSendBuyerAlert, resolveBuyerConfidencePct } = await import('../sales-layer/buyerHeat');

  for (const f of candidates.slice(0, 15)) {
    findingIds.push(f.id);
    try {
      let acq = readAcquisitionProfile(f.extractedData);
      if (!acq) {
        acq = await processLeadAcquisition({ findingId: f.id, notifyTelegram: false });
      }
      if (acq?.isBuyer) {
        qualified += 1;
        const score = resolveBuyerConfidencePct({
          acquisitionFinalScore: acq.priority.finalScore,
          intentConfidence: acq.intent.confidence,
        });
        if (score >= 80) hot += 1;
        if (shouldSendBuyerAlert(score) || acq.isVip) {
          await processSalesLayer({ findingId: f.id, notifyFollowUp: false }).catch(() => null);
          // Buyer alert via existing notify path (LEAD channel) — best effort
          const { notifyFindingIfEligible } = await import(
            '../../notifications/telegramNotificationService'
          );
          await notifyFindingIfEligible({ findingId: f.id, force: false }).catch(() => null);
        }
      }
    } catch (error: unknown) {
      errors.push(
        `finding ${f.id.slice(0, 8)}: ${error instanceof Error ? error.message : String(error)}`.slice(
          0,
          160,
        ),
      );
    }
  }

  const jobs = req.jobIds.length
    ? await prisma.agentJob.findMany({
        where: { id: { in: req.jobIds } },
        select: { id: true, status: true },
      })
    : [];
  const activeJobs = jobs.filter(j => ['queued', 'claimed', 'running'].includes(j.status));
  const failedJobs = jobs.filter(j => j.status === 'failed');

  let status: AcquisitionLifecycleStatus = req.status;
  if (activeJobs.length) status = 'WAITING_RESULTS';
  else if (!req.jobIds.length && req.status === 'BLOCKED') status = 'BLOCKED';
  else if (failedJobs.length && !findingIds.length) status = 'FAILED';
  else if (qualified > 0 || findingIds.length > 0) {
    status = activeJobs.length ? 'WAITING_RESULTS' : qualified > 0 ? 'COMPLETED' : 'PARTIAL';
  } else if (!activeJobs.length) {
    status = req.jobIds.length ? 'PARTIAL' : req.status;
  }

  const result: CampaignAcquisitionResult = {
    sourcesScanned: req.sourceIds.length,
    postsSeen: findings.length,
    candidates: candidates.length,
    qualified,
    hot,
    findingIds: findingIds.slice(0, 40),
    jobIds: req.jobIds,
    sourceIds: req.sourceIds,
    errors: errors.slice(0, 8),
    coverage: `${req.sourceIds.length} sources · ${findings.length} posts · ${candidates.length} candidates`,
    nextAction:
      status === 'WAITING_RESULTS'
        ? 'Chờ worker hoàn tất scan_source'
        : qualified > 0
          ? 'Mở Lead Center / Sales pipeline'
          : candidates.length
            ? 'Không đủ buyer signal — nới keyword hoặc thêm source'
            : 'Chưa có finding khớp campaign — kiểm tra worker/source',
    summarizedAt: nowIso(),
  };

  req = {
    ...req,
    status,
    result,
    updatedAt: nowIso(),
    completedAt: ['COMPLETED', 'PARTIAL', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(status)
      ? nowIso()
      : null,
    lastError: errors[0] || req.lastError,
  };
  requests[idx] = req;
  await writeRequests(campaign.id, requests);
  return req;
}

/** Approve campaign → ensure request → queue scans (public façade). */
export async function startAcquisitionAfterCampaignApproval(input: {
  campaignId: string;
  actor?: string | null;
}): Promise<CampaignAcquisitionRequest> {
  const { request, reused } = await ensureAcquisitionRequest(input);
  if (reused && ['WAITING_RESULTS', 'RUNNING', 'QUEUED', 'COMPLETED', 'PARTIAL'].includes(request.status)) {
    return (await summarizeAcquisitionResults({
      campaignId: input.campaignId,
      requestId: request.id,
    })) || request;
  }
  const queued = await queueAcquisitionScans({
    campaignId: input.campaignId,
    requestId: request.id,
    actor: input.actor,
  });
  // Soft summarize immediately (may be empty if worker pending)
  return (
    (await summarizeAcquisitionResults({
      campaignId: input.campaignId,
      requestId: queued.id,
    })) || queued
  );
}

export async function getCampaignAcquisitionSnapshot(
  campaignId: string,
): Promise<CampaignAcquisitionSnapshot> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return toAcquisitionSnapshot(null);
  const latest = latestRequest(readRequests(campaign));
  if (latest && ['QUEUED', 'RUNNING', 'WAITING_RESULTS'].includes(latest.status)) {
    const refreshed = await summarizeAcquisitionResults({
      campaignId,
      requestId: latest.id,
    });
    return toAcquisitionSnapshot(refreshed || latest);
  }
  return toAcquisitionSnapshot(latest);
}
