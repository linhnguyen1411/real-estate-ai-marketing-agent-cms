/**
 * Compose Executive Command Center V2 snapshot from real data sources.
 */

import { prisma } from '../../prisma';
import { evaluateSourceQuality } from './sourceQualityService';
import { buildIntegrityBlock, scanSnapshotFakeMarkers, sourceAggregate } from './executiveIntegrityService';
import type {
  AttentionItem,
  ComponentHealth,
  ExecutiveAction,
  ExecutiveSnapshot,
  RecentBuyerRow,
  RuntimeState,
  ScanScheduleRow,
  ScanState,
  SourcePerformanceRow,
} from './types';
import { aggregatePipelineValue } from '../sales-layer/pipelineValue';
import { readAcquisitionProfile } from '../lead-acquisition';
import { readSalesProfile, resolveSourceProvenance } from '../sales-layer';

const STALE_AFTER_SECONDS = 120;
const SALES_BATCH = 1000;

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function num(v: number | bigint | null | undefined): number {
  if (typeof v === 'bigint') return Number(v);
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function budgetLabel(min: bigint | null, max: bigint | null): string | null {
  const a = num(min);
  const b = num(max);
  if (!a && !b) return null;
  const f = (x: number) => `${Math.round(x / 1_000_000_000)} tỷ`;
  if (a && b) return `${f(a)} - ${f(b)}`;
  return f(a || b);
}

function statusFromHeartbeat(lastHeartbeatIso: string | null, offlineAfterMs = 90_000): RuntimeState {
  if (!lastHeartbeatIso) return 'offline';
  const ms = Date.now() - Date.parse(lastHeartbeatIso);
  if (!Number.isFinite(ms) || ms > offlineAfterMs) return 'offline';
  if (ms > 45_000) return 'degraded';
  return 'online';
}

function component(status: RuntimeState, reason: string | null, updatedAt: string | null): ComponentHealth {
  return { status, reason, updatedAt };
}

function scanStateForRow(input: {
  sourceStatus: string;
  currentJobStatus: string | null;
  lastScanAt: Date | null;
  nextScanAt: Date | null;
  queuedJobs: number;
  failed24h: number;
  browserOnline: boolean;
}): ScanState {
  const status = (input.sourceStatus || '').toLowerCase();
  if (status === 'paused') return 'paused';
  if (input.currentJobStatus === 'running' || input.currentJobStatus === 'claimed') return 'running';
  if (!input.browserOnline && (input.queuedJobs > 0 || status === 'active')) return 'offline';
  if (input.queuedJobs > 0) {
    const overdueMs = input.nextScanAt ? Date.now() - input.nextScanAt.getTime() : 0;
    if (overdueMs > 30 * 60_000) return 'queued_too_long';
    return 'queued';
  }
  if (input.failed24h > 0) return 'failed';
  if (input.nextScanAt && Date.now() > input.nextScanAt.getTime()) return 'overdue';
  if (input.lastScanAt && Date.now() - input.lastScanAt.getTime() > 6 * 3600_000) return 'stale';
  return 'success';
}

function summarizeAiStatus(runtime: ExecutiveSnapshot['runtime']): {
  status: RuntimeState;
  reason: string;
} {
  if (runtime.scanner.status === 'offline') {
    return { status: 'offline', reason: runtime.scanner.reason || 'Scanner offline' };
  }
  if (runtime.browser.status === 'offline') {
    return { status: 'offline', reason: runtime.browser.reason || 'Browser session offline' };
  }
  if (runtime.worker.status === 'offline') {
    return { status: 'offline', reason: runtime.worker.reason || 'Worker offline' };
  }
  if (runtime.queue.status === 'degraded' || runtime.scheduler.status === 'degraded') {
    return { status: 'degraded', reason: 'Queue/Scheduler degraded' };
  }
  return { status: 'online', reason: 'All core components healthy' };
}

async function buildRecentBuyers(limit = 10): Promise<RecentBuyerRow[]> {
  const rows = await prisma.agentFinding.findMany({
    where: {
      type: 'lead_signal',
      status: { notIn: ['duplicate', 'dismissed'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: {
      id: true,
      title: true,
      personName: true,
      classification: true,
      propertyType: true,
      primaryLocation: true,
      primaryPhone: true,
      budgetMin: true,
      budgetMax: true,
      extractedData: true,
      createdAt: true,
      source: { select: { name: true } },
    },
  });
  const { readAcquisitionProfile } = await import('../lead-acquisition');
  const { readSalesProfile } = await import('../sales-layer');

  const buyers: RecentBuyerRow[] = [];
  for (const row of rows) {
    const acq = readAcquisitionProfile(row.extractedData);
    if (!acq?.isBuyer) continue;
    const sales = readSalesProfile(row.extractedData);
    const confidence = Math.round((acq.intent.confidence || 0) * 100);
    buyers.push({
      findingId: row.id,
      title: row.personName || row.title,
      persona: acq.persona.persona || null,
      role: row.classification || null,
      confidence,
      need: row.title || null,
      budget: budgetLabel(row.budgetMin, row.budgetMax),
      location: row.primaryLocation || null,
      propertyType: row.propertyType || null,
      hasPhone: Boolean(row.primaryPhone),
      source: row.source?.name || null,
      createdAt: row.createdAt.toISOString(),
      journey: sales?.journeyStage || null,
      nextAction: sales?.recommendation?.label || null,
      openLink: `/admin/agents/lead-center?findingId=${encodeURIComponent(row.id)}`,
    });
    if (buyers.length >= limit) break;
  }
  return buyers;
}

type SalesFactRow = {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  sourceType: string | null;
  createdAt: Date;
  status: string;
  budgetMin: bigint | null;
  budgetMax: bigint | null;
  askingPrice: bigint | null;
  extractedData: unknown;
};

async function loadAllSalesFacts(): Promise<SalesFactRow[]> {
  const out: SalesFactRow[] = [];
  let cursor: string | null = null;
  while (true) {
    const rows = await prisma.agentFinding.findMany({
      where: { type: 'lead_signal', status: { notIn: ['duplicate', 'dismissed'] } },
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: SALES_BATCH,
      select: {
        id: true,
        sourceId: true,
        createdAt: true,
        status: true,
        budgetMin: true,
        budgetMax: true,
        askingPrice: true,
        extractedData: true,
        source: { select: { name: true, type: true } },
      },
    });
    if (!rows.length) break;
    for (const row of rows) {
      out.push({
        id: row.id,
        sourceId: row.sourceId,
        sourceName: row.source?.name || null,
        sourceType: row.source?.type || null,
        createdAt: row.createdAt,
        status: row.status,
        budgetMin: row.budgetMin,
        budgetMax: row.budgetMax,
        askingPrice: row.askingPrice,
        extractedData: row.extractedData,
      });
    }
    cursor = rows[rows.length - 1]?.id || null;
    if (rows.length < SALES_BATCH) break;
  }
  return out;
}

export async function buildExecutiveSnapshot(): Promise<ExecutiveSnapshot> {
  const generatedAt = new Date();
  const todayStart = new Date(generatedAt);
  todayStart.setHours(0, 0, 0, 0);
  const last24h = new Date(Date.now() - 24 * 3600_000);

  const [
    runtimeSnap,
    browserSessions,
    sources,
    sourceJobs,
    sourceCounts,
    allSalesFacts,
    sourceProvenanceRows,
  ] =
    await Promise.all([
      import('../../agent/runtimeObservability')
        .then(m =>
          m.buildAutomationRuntimeSnapshot({
            id: 'system',
            name: 'System',
            email: 'system@local',
            role: 'owner',
          }),
        )
        .catch(() => null),
      prisma.browserSession.findMany({
        select: { id: true, status: true, lastHeartbeatAt: true, lastError: true, updatedAt: true },
      }),
      prisma.agentSource.findMany({
        where: {},
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          name: true,
          type: true,
          url: true,
          status: true,
          priority: true,
          scanIntervalMinutes: true,
          lastScannedAt: true,
          nextScanAt: true,
          lastError: true,
        },
      }),
      prisma.agentJob.findMany({
        where: { type: { in: ['scan_source', 'source_scan'] } },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          sourceId: true,
          status: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
          updatedAt: true,
          errorMessage: true,
        },
        take: 6000,
      }),
      prisma.agentFinding.groupBy({
        by: ['sourceId', 'status', 'classification'],
        where: { type: 'lead_signal' },
        _count: { _all: true },
      }),
      loadAllSalesFacts(),
      prisma.agentFinding.findMany({
        where: { type: 'lead_signal' },
        orderBy: { createdAt: 'desc' },
        take: 3000,
        select: {
          sourceId: true,
          extractedData: true,
          source: { select: { name: true, type: true } },
          scannedContent: { select: { canonicalUrl: true } },
        },
      }),
    ]);

  const sourceContentCounts = await prisma.scannedContent.groupBy({
    by: ['sourceId'],
    where: { createdAt: { gte: last24h } },
    _count: { _all: true },
  });

  const runningWorkers = runtimeSnap?.workers?.filter(w => w.online).length || 0;
  const workerHeartbeat =
    runtimeSnap?.workers
      ?.map(w => (w.heartbeatAt ? Date.parse(w.heartbeatAt) : 0))
      .reduce((a, b) => Math.max(a, b), 0) || 0;
  const lastWorkerHeartbeatIso = workerHeartbeat ? new Date(workerHeartbeat).toISOString() : null;

  const onlineSessions = browserSessions.filter(s => s.status === 'online').length;
  const offlineSessions = browserSessions.filter(s => s.status !== 'online').length;
  const latestBrowserHeartbeat = browserSessions
    .map(s => s.lastHeartbeatAt?.getTime() || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  const browserHeartbeatIso = latestBrowserHeartbeat ? new Date(latestBrowserHeartbeat).toISOString() : null;

  const queuedJobs = sourceJobs.filter(j => j.status === 'queued').length;
  const runningJobs = sourceJobs.filter(j => j.status === 'running' || j.status === 'claimed').length;
  const failedJobs = sourceJobs.filter(j => j.status === 'failed').length;

  const schedulerTickMs = runtimeSnap?.metrics?.schedulerTickMs || null;
  const schedulerLastTick = runtimeSnap?.metrics?.schedulerLastTickAt || null;
  const schedulerStatus: RuntimeState =
    schedulerLastTick && Date.now() - Date.parse(schedulerLastTick) > 3 * 60_000
      ? 'degraded'
      : runtimeSnap?.health?.scheduler === 'online'
        ? 'online'
        : 'degraded';

  const scannerStatus: RuntimeState =
    runningWorkers === 0
      ? 'offline'
      : queuedJobs > 0 && runningJobs === 0
        ? 'degraded'
        : 'online';
  const browserStatus = statusFromHeartbeat(browserHeartbeatIso, 120_000);
  const workerStatus = statusFromHeartbeat(lastWorkerHeartbeatIso, 90_000);
  const queueStatus: RuntimeState = failedJobs > 0 ? 'degraded' : runningJobs > 0 ? 'online' : 'degraded';

  const runtime: ExecutiveSnapshot['runtime'] = {
    overallStatus: 'online',
    scanner: {
      ...component(
        scannerStatus,
        scannerStatus === 'offline'
          ? 'No active worker'
          : scannerStatus === 'degraded'
            ? 'Queue exists but no running scan'
            : null,
        lastWorkerHeartbeatIso,
      ),
      sources: sources.length,
      runningSources: runningJobs,
    },
    browser: {
      ...component(
        browserStatus,
        browserStatus === 'offline' ? 'Browser session unavailable/expired' : null,
        browserHeartbeatIso,
      ),
      sessionsOnline: onlineSessions,
      sessionsOffline: offlineSessions,
    },
    worker: {
      ...component(
        workerStatus,
        workerStatus === 'offline' ? 'Worker heartbeat expired' : null,
        lastWorkerHeartbeatIso,
      ),
      activeWorkers: runningWorkers,
      lastHeartbeatAt: lastWorkerHeartbeatIso,
    },
    queue: {
      ...component(
        queueStatus,
        queueStatus === 'degraded' ? 'Queued/failed jobs require attention' : null,
        sourceJobs[0] ? sourceJobs[0].updatedAt.toISOString() : null,
      ),
      queuedJobs,
      runningJobs,
      failedJobs,
    },
    scheduler: {
      ...component(
        schedulerStatus,
        schedulerStatus === 'degraded' ? 'Scheduler tick stale or unavailable' : null,
        schedulerLastTick,
      ),
      tickIntervalMs: schedulerTickMs,
      lastTickAt: schedulerLastTick,
    },
  };

  const aiSummary = summarizeAiStatus(runtime);
  runtime.overallStatus = aiSummary.status;

  const sourceCountMap = new Map(
    sourceCounts.map(r => [
      `${r.sourceId}:${r.status}:${r.classification || ''}`,
      Number(r._count._all || 0),
    ]),
  );
  const sourcePostsMap = new Map(sourceContentCounts.map(r => [r.sourceId, Number(r._count._all || 0)]));

  const jobsBySource = new Map<string, typeof sourceJobs>();
  for (const job of sourceJobs) {
    if (!job.sourceId) continue;
    const arr = jobsBySource.get(job.sourceId) || [];
    arr.push(job);
    jobsBySource.set(job.sourceId, arr);
  }

  const provenanceBySource = new Map<string, { label: string | null; url: string | null }>();
  for (const row of sourceProvenanceRows) {
    if (!row.sourceId || provenanceBySource.has(row.sourceId)) continue;
    const prov = resolveSourceProvenance({
      extractedData: row.extractedData,
      agentSourceName: row.source?.name || null,
      agentSourceType: row.source?.type || null,
      canonicalUrl: row.scannedContent?.canonicalUrl || null,
    });
    provenanceBySource.set(row.sourceId, { label: prov.label, url: prov.url });
  }

  const sourcePerformance: SourcePerformanceRow[] = [];
  const scanSchedule: ScanScheduleRow[] = [];
  for (const source of sources) {
    const prov = provenanceBySource.get(source.id);
    const jobs = (jobsBySource.get(source.id) || []).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    const currentJob = jobs.find(j => j.status === 'running' || j.status === 'claimed') || null;
    const queuedCount = jobs.filter(j => j.status === 'queued').length;
    const failed24h = jobs.filter(j => j.status === 'failed' && j.updatedAt >= last24h).length;
    const completed24h = jobs.filter(j => j.status === 'completed' && j.updatedAt >= last24h).length;
    const successRate = pct(completed24h, Math.max(completed24h + failed24h, 1));
    const failRate = pct(failed24h, Math.max(completed24h + failed24h, 1));
    const lastSuccess = jobs.find(j => j.status === 'completed') || null;

    const leads =
      (sourceCountMap.get(`${source.id}:new:buyer`) || 0) +
      (sourceCountMap.get(`${source.id}:new:investor`) || 0) +
      (sourceCountMap.get(`${source.id}:new:tenant`) || 0) +
      (sourceCountMap.get(`${source.id}:new:unknown`) || 0) +
      (sourceCountMap.get(`${source.id}:reviewed:buyer`) || 0) +
      (sourceCountMap.get(`${source.id}:reviewed:investor`) || 0) +
      (sourceCountMap.get(`${source.id}:reviewed:tenant`) || 0) +
      (sourceCountMap.get(`${source.id}:reviewed:unknown`) || 0) +
      (sourceCountMap.get(`${source.id}:promoted_to_investor_lead:investor`) || 0);
    const buyers =
      (sourceCountMap.get(`${source.id}:new:buyer`) || 0) +
      (sourceCountMap.get(`${source.id}:reviewed:buyer`) || 0);
    const investors =
      (sourceCountMap.get(`${source.id}:new:investor`) || 0) +
      (sourceCountMap.get(`${source.id}:reviewed:investor`) || 0);
    const tenants =
      (sourceCountMap.get(`${source.id}:new:tenant`) || 0) +
      (sourceCountMap.get(`${source.id}:reviewed:tenant`) || 0);
    const dismissed =
      (sourceCountMap.get(`${source.id}:dismissed:buyer`) || 0) +
      (sourceCountMap.get(`${source.id}:dismissed:investor`) || 0) +
      (sourceCountMap.get(`${source.id}:dismissed:tenant`) || 0) +
      (sourceCountMap.get(`${source.id}:dismissed:unknown`) || 0);
    const duplicate =
      (sourceCountMap.get(`${source.id}:duplicate:buyer`) || 0) +
      (sourceCountMap.get(`${source.id}:duplicate:investor`) || 0) +
      (sourceCountMap.get(`${source.id}:duplicate:tenant`) || 0) +
      (sourceCountMap.get(`${source.id}:duplicate:unknown`) || 0);
    const qualified = Math.max(0, buyers + investors + tenants);
    const totalSignals = leads + dismissed + duplicate;
    const freshnessHours = source.lastScannedAt
      ? (Date.now() - source.lastScannedAt.getTime()) / 3600_000
      : null;

    const quality = evaluateSourceQuality({
      leads,
      buyers,
      qualified,
      investor: investors,
      tenant: tenants,
      duplicateRate: pct(duplicate, Math.max(totalSignals, 1)),
      dismissedRate: pct(dismissed, Math.max(totalSignals, 1)),
      scanSuccessRate: successRate,
      scanFailureRate: failRate,
      freshnessHours,
    });

    const browserOnline = browserStatus !== 'offline';
    const scheduleStatus = scanStateForRow({
      sourceStatus: source.status,
      currentJobStatus: currentJob?.status || null,
      lastScanAt: source.lastScannedAt,
      nextScanAt: source.nextScanAt,
      queuedJobs: queuedCount,
      failed24h,
      browserOnline,
    });

    sourcePerformance.push({
      sourceId: source.id,
      sourceName: prov?.label || source.name,
      sourceType: source.type,
      sourceUrl: prov?.url || source.url,
      status: source.status,
      priority: source.priority,
      qualityScore: quality.qualityScore,
      recommendation: quality.recommendation,
      recommendationReason: quality.recommendationReason,
      lastScanAt: toIso(source.lastScannedAt),
      nextScanAt: toIso(source.nextScanAt),
      lastSuccessScanAt: toIso(lastSuccess?.updatedAt || null),
      currentJobStatus: currentJob?.status || null,
      currentJobId: currentJob?.id || null,
      postsScanned: sourcePostsMap.get(source.id) || 0,
      findings: leads + dismissed + duplicate,
      leads,
      buyers,
      qualified,
      investor: investors,
      tenant: tenants,
      dismissed,
      duplicate,
      leadRate: pct(leads, Math.max(sourcePostsMap.get(source.id) || 0, 1)),
      buyerRate: pct(buyers, Math.max(leads, 1)),
      qualifiedRate: pct(qualified, Math.max(leads, 1)),
      duplicateRate: pct(duplicate, Math.max(totalSignals, 1)),
      failureRate: failRate,
      freshnessHours,
      lastError: source.lastError || currentJob?.errorMessage || null,
      filters: {
        leads: `/admin/agents/lead-center?sourceId=${encodeURIComponent(source.id)}`,
        buyers: `/admin/agents/lead-center?sourceId=${encodeURIComponent(source.id)}&classification=buyer`,
        qualified: `/admin/agents/lead-center?sourceId=${encodeURIComponent(source.id)}&quickFilter=processed`,
        urgent: `/admin/agents/lead-center?sourceId=${encodeURIComponent(source.id)}&urgent=true`,
      },
      actions: {
        scanNow: source.status === 'active',
        pause: source.status === 'active',
        resume: source.status === 'paused',
        edit: true,
        viewLeads: true,
        viewHistory: true,
      },
    });

    const lastResult =
      scheduleStatus === 'failed'
        ? 'FAILED'
        : scheduleStatus === 'running'
          ? 'RUNNING'
          : scheduleStatus === 'queued'
            ? 'QUEUED'
            : scheduleStatus === 'queued_too_long'
              ? 'QUEUED TOO LONG'
              : 'SUCCESS';

    scanSchedule.push({
      sourceId: source.id,
      sourceName: source.name,
      status: scheduleStatus,
      currentJobId: currentJob?.id || null,
      currentJobStatus: currentJob?.status || null,
      lastScanAt: toIso(source.lastScannedAt),
      nextScanAt: toIso(source.nextScanAt),
      intervalMinutes: source.scanIntervalMinutes,
      lastResult,
      jobsQueued: queuedCount,
      jobsRunning: currentJob ? 1 : 0,
      jobsFailed24h: failed24h,
      postsScanned24h: sourcePostsMap.get(source.id) || 0,
      findings24h: leads,
      leads24h: leads,
      buyers24h: buyers,
      lastError: source.lastError || currentJob?.errorMessage || null,
      nextAction:
        scheduleStatus === 'offline'
          ? 'View Runtime'
          : scheduleStatus === 'failed'
            ? 'View Jobs'
            : scheduleStatus === 'queued_too_long'
              ? 'Review Queue'
              : 'Monitor',
    });
  }

  sourcePerformance.sort((a, b) => b.qualityScore - a.qualityScore || b.buyers - a.buyers);
  scanSchedule.sort((a, b) => {
    const av = a.nextScanAt ? Date.parse(a.nextScanAt) : Number.MAX_SAFE_INTEGER;
    const bv = b.nextScanAt ? Date.parse(b.nextScanAt) : Number.MAX_SAFE_INTEGER;
    return av - bv;
  });

  const recentBuyers = await buildRecentBuyers(10);
  const salesRows = allSalesFacts
    .map(row => {
      const acq = readAcquisitionProfile(row.extractedData);
      const sales = readSalesProfile(row.extractedData);
      if (!acq?.isBuyer || !sales) return null;
      return {
        id: row.id,
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        sourceType: row.sourceType,
        createdAt: row.createdAt,
        profile: sales,
        acq,
        budgetMin: row.budgetMin,
        budgetMax: row.budgetMax,
        askingPrice: row.askingPrice,
      };
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  const buyersToday = salesRows.filter(r => r.createdAt >= todayStart).length;
  const qualifiedStages = new Set([
    'qualified',
    'assigned',
    'contacted',
    'appointment',
    'negotiating',
    'won',
  ]);
  const qualifiedToday = salesRows.filter(
    r => r.createdAt >= todayStart && qualifiedStages.has(r.profile.pipelineStage),
  ).length;
  const urgentBuyers = salesRows.filter(
    r => String(r.profile.recommendation?.urgency || '') === 'urgent',
  ).length;

  const ignoredToday = await prisma.agentFinding.count({
    where: { status: 'dismissed', dismissedAt: { gte: todayStart } },
  });
  const spamLearnedToday = await prisma.agentSpamRule.count({
    where: { createdAt: { gte: todayStart }, metadata: { path: ['origin'], equals: 'ignore_learning' } },
  });
  const spamRulesTotal = await prisma.agentSpamRule.count({ where: { isActive: true, archivedAt: null } });
  const spamDecisionCounts = await prisma.agentFinding.count({
    where: { status: 'dismissed', dismissReason: { in: ['spam', 'sales_ignore'] } },
  });
  const totalFindings = await prisma.agentFinding.count();
  const spamHitRate = totalFindings > 0 ? Math.round((spamDecisionCounts / totalFindings) * 1000) / 10 : 0;
  const rejectedBeforeAi = spamRulesTotal;

  let decisionLearningMetrics = { pendingLearning: 0, decisionsLearnedToday: 0, promoted: 0, falsePositivePrevented: 0 };
  try {
    const { getDecisionLearningMetrics } = await import('../sales-layer/ignoreLearnService');
    decisionLearningMetrics = await getDecisionLearningMetrics();
  } catch { /* non-critical */ }

  const salesAgg = aggregatePipelineValue(
    salesRows.map(r => ({
      profile: r.profile,
      budgetMin: r.budgetMin,
      budgetMax: r.budgetMax,
      askingPrice: r.askingPrice,
      sourceId: r.sourceId,
      sourceName: r.sourceName,
      createdAt: r.createdAt,
    })),
  );
  const pipelineValue = salesAgg.pipelineValueTy;
  const expectedRevenue = salesAgg.expectedRevenueTy;

  const sourcesSummary = {
    total: sources.length,
    active: sources.filter(s => s.status === 'active').length,
    running: scanSchedule.filter(s => s.status === 'running').length,
    queued: scanSchedule.filter(s => s.status === 'queued' || s.status === 'queued_too_long').length,
    failed: scanSchedule.filter(s => s.status === 'failed').length,
    paused: sources.filter(s => s.status === 'paused').length,
    offline: scanSchedule.filter(s => s.status === 'offline' || s.status === 'stale').length,
  };

  const attention: AttentionItem[] = [];
  if (runtime.browser.status === 'offline') {
    attention.push({
      severity: 'critical',
      title: 'Browser offline',
      detail: 'Browser session unavailable, scan may stall.',
      actionLabel: 'View Runtime',
      actionHref: '/admin/agents/runtime',
    });
  }
  if (runtime.queue.queuedJobs > 0 && runtime.queue.runningJobs === 0) {
    attention.push({
      severity: 'critical',
      title: `${runtime.queue.queuedJobs} scan jobs queued`,
      detail: 'Queue has pending scans but no running worker slot.',
      actionLabel: 'View Jobs',
      actionHref: '/admin/agents/jobs?type=scan_source&status=queued',
    });
  }
  if (urgentBuyers > 0) {
    attention.push({
      severity: 'warning',
      title: `${urgentBuyers} urgent buyers`,
      detail: 'Needs immediate sales action.',
      actionLabel: 'Open urgent list',
      actionHref: '/admin/agents/lead-center?urgent=true',
    });
  }
  const lowSources = sourcePerformance.filter(s => s.qualityScore < 55).length;
  if (lowSources > 0) {
    attention.push({
      severity: 'warning',
      title: `${lowSources} low quality sources`,
      detail: 'Consider REDUCE/PAUSE based on recommendation.',
      actionLabel: 'Review sources',
      actionHref: '/admin/agents/executive-dashboard',
    });
  }
  if (!attention.length) {
    attention.push({
      severity: 'info',
      title: 'No major blockers',
      detail: 'System healthy from current snapshot.',
      actionLabel: null,
      actionHref: null,
    });
  }

  const actionsAll: ExecutiveAction[] = [
    {
      id: 'review_buyers',
      label: 'Review Buyers',
      available: true,
      method: 'GET',
      href: '/admin/agents/lead-center',
      reason: null,
    },
    {
      id: 'review_urgent',
      label: 'Review Urgent Buyers',
      available: true,
      method: 'GET',
      href: '/admin/agents/lead-center?urgent=true',
      reason: null,
    },
    {
      id: 'view_runtime',
      label: 'View Runtime',
      available: true,
      method: 'GET',
      href: '/admin/agents/runtime',
      reason: null,
    },
    {
      id: 'view_queue',
      label: 'View Failed Jobs',
      available: true,
      method: 'GET',
      href: '/admin/agents/jobs?type=scan_source&status=failed',
      reason: null,
    },
    {
      id: 'scan_now',
      label: 'Scan Source',
      available: true,
      method: 'POST',
      href: '/api/agent/sources/:id/run',
      reason: null,
    },
    {
      id: 'pause_resume_source',
      label: 'Pause/Resume Source',
      available: true,
      method: 'PATCH',
      href: '/api/agent/sources/:id',
      reason: null,
    },
  ];

  const aiLastActivityAt =
    sourceJobs[0]?.updatedAt?.toISOString() ||
    lastWorkerHeartbeatIso ||
    browserHeartbeatIso ||
    null;
  const aiSummaryText =
    aiSummary.status === 'online'
      ? `AI đang chạy, ${buyersToday} buyer hôm nay, ${urgentBuyers} urgent buyer cần xử lý.`
      : aiSummary.status === 'degraded'
        ? `AI degraded: ${aiSummary.reason}. Dữ liệu vẫn cập nhật nhưng cần theo dõi runtime.`
        : `AI offline: ${aiSummary.reason}. Dashboard đang hiển thị snapshot gần nhất.`;

  const freshnessAgeSeconds = Math.max(0, Math.floor((Date.now() - generatedAt.getTime()) / 1000));

  const actualBySource = salesRows.reduce(
    (acc, row) => {
      const key = row.sourceId || '__unknown__';
      const cur = acc.get(key) || { leads: 0, buyers: 0, qualified: 0, investors: 0 };
      cur.leads += 1;
      if (row.acq.isBuyer) cur.buyers += 1;
      if (qualifiedStages.has(row.profile.pipelineStage)) cur.qualified += 1;
      if (row.acq.persona.persona === 'investor') cur.investors += 1;
      acc.set(key, cur);
      return acc;
    },
    new Map<string, { leads: number; buyers: number; qualified: number; investors: number }>(),
  );
  const sourceKpiAgg = sourceAggregate(sourcePerformance);
  const sourceActualAgg = [...actualBySource.values()].reduce(
    (acc, row) => {
      acc.leads += row.leads;
      acc.buyers += row.buyers;
      acc.qualified += row.qualified;
      acc.investors += row.investors;
      return acc;
    },
    { leads: 0, buyers: 0, qualified: 0, investors: 0 },
  );

  const sourceStatusActual = scanSchedule.filter(s =>
    ['running', 'queued', 'queued_too_long', 'failed', 'offline', 'paused', 'stale', 'overdue'].includes(s.status),
  ).length;
  const sourceStatusKpi =
    sourcesSummary.running +
    sourcesSummary.queued +
    sourcesSummary.failed +
    sourcesSummary.offline +
    sourcesSummary.paused;

  const integrity = buildIntegrityBlock({
    buyersTodayKpi: buyersToday,
    buyersTodayActual: buyersToday,
    qualifiedTodayKpi: qualifiedToday,
    qualifiedTodayActual: qualifiedToday,
    urgentKpi: urgentBuyers,
    urgentActual: urgentBuyers,
    pipelineKpi: Math.round(pipelineValue * 10) / 10,
    pipelineActual: Math.round(salesAgg.pipelineValueTy * 10) / 10,
    expectedRevenueKpi: Math.round(expectedRevenue * 10) / 10,
    expectedRevenueActual: Math.round(salesAgg.expectedRevenueTy * 10) / 10,
    sourceLeadsKpi: sourceKpiAgg.leads,
    sourceLeadsActual: sourceActualAgg.leads,
    sourceBuyersKpi: sourceKpiAgg.buyers,
    sourceBuyersActual: sourceActualAgg.buyers,
    sourceQualifiedKpi: sourceKpiAgg.qualified,
    sourceQualifiedActual: sourceActualAgg.qualified,
    sourceInvestorsKpi: sourceKpiAgg.investors,
    sourceInvestorsActual: sourceActualAgg.investors,
    sourceStatusKpi,
    sourceStatusActual,
  });

  const draftSnapshot: ExecutiveSnapshot = {
    version: 'executive_command_center_v2',
    generatedAt: generatedAt.toISOString(),
    freshness: {
      generatedAt: generatedAt.toISOString(),
      stale: freshnessAgeSeconds > STALE_AFTER_SECONDS,
      staleAfterSeconds: STALE_AFTER_SECONDS,
      ageSeconds: freshnessAgeSeconds,
    },
    ai: {
      status: aiSummary.status,
      reason: aiSummary.reason,
      lastActivityAt: aiLastActivityAt,
      summary: aiSummaryText,
    },
    runtime,
    sales: {
      buyersToday,
      qualifiedToday,
      urgentBuyers,
      pipelineValue,
      expectedRevenue,
      ignoredToday,
      spamLearnedToday,
      spamHitRate,
      rejectedBeforeAi,
      pendingLearning: decisionLearningMetrics.pendingLearning,
      decisionsLearnedToday: decisionLearningMetrics.decisionsLearnedToday,
      learningPromoted: decisionLearningMetrics.promoted,
      falsePositivePrevented: decisionLearningMetrics.falsePositivePrevented,
      links: {
        buyersToday: '/admin/agents/lead-center?classification=buyer',
        qualifiedToday: '/admin/agents/lead-center?quickFilter=processed',
        urgentBuyers: '/admin/agents/lead-center?urgent=true',
        pipeline: '/admin/agents/lead-center',
        expectedRevenue: '/admin/agents/lead-center',
      },
    },
    sources: sourcesSummary,
    sourcePerformance,
    scanSchedule,
    recentBuyers,
    attention,
    actions: {
      available: actionsAll.filter(a => a.available),
      unavailable: actionsAll.filter(a => !a.available),
    },
    integrity,
  };
  const markerHits = scanSnapshotFakeMarkers(draftSnapshot);
  if (markerHits.length > 0) {
    draftSnapshot.integrity.status = 'MISMATCH';
    draftSnapshot.integrity.mismatchCount += 1;
    draftSnapshot.attention.unshift({
      severity: 'critical',
      title: 'Forbidden marker detected',
      detail: markerHits[0]!,
      actionLabel: null,
      actionHref: null,
    });
  }
  if (draftSnapshot.integrity.status === 'MISMATCH') {
    draftSnapshot.attention.unshift({
      severity: 'critical',
      title: 'DATA MISMATCH',
      detail: 'Executive snapshot is inconsistent with source data.',
      actionLabel: 'Review Lead Center',
      actionHref: '/admin/agents/lead-center',
    });
  }
  return draftSnapshot;
}

export async function listExecutiveDrilldown(input: {
  kind: 'buyers' | 'qualified' | 'urgent' | 'investor' | 'tenant';
  page?: number;
  limit?: number;
}) {
  const page = Math.max(0, input.page || 0);
  const limit = Math.min(200, Math.max(10, input.limit || 50));
  const rows = await loadAllSalesFacts();
  const filtered = rows
    .map(row => {
      const acq = readAcquisitionProfile(row.extractedData);
      const sales = readSalesProfile(row.extractedData);
      if (!acq?.isBuyer || !sales) return null;
      return { row, acq, sales };
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .filter(v => {
      if (input.kind === 'buyers') return true;
      if (input.kind === 'qualified') {
        return ['qualified', 'assigned', 'contacted', 'appointment', 'negotiating', 'won'].includes(
          v.sales.pipelineStage,
        );
      }
      if (input.kind === 'urgent') return v.sales.recommendation.urgency === 'urgent';
      if (input.kind === 'investor') return v.acq.persona.persona === 'investor';
      if (input.kind === 'tenant') return v.acq.persona.persona === 'rental';
      return false;
    });

  const total = filtered.length;
  const items = filtered
    .sort((a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime())
    .slice(page * limit, page * limit + limit)
    .map(v => ({
      findingId: v.row.id,
      title: v.row.id,
      sourceId: v.row.sourceId,
      sourceName: v.row.sourceName,
      createdAt: v.row.createdAt.toISOString(),
      urgency: v.sales.recommendation.urgency,
      pipelineStage: v.sales.pipelineStage,
      persona: v.acq.persona.persona,
      openLink: `/admin/agents/lead-center?findingId=${encodeURIComponent(v.row.id)}`,
    }));
  return { total, page, limit, items };
}

export function formatExecutiveDashboardLines(snap: ExecutiveSnapshot): string[] {
  return [
    'EXECUTIVE COMMAND CENTER V2',
    '',
    `AI: ${snap.ai.status.toUpperCase()} · ${snap.ai.reason}`,
    `Scanner: ${snap.runtime.scanner.status.toUpperCase()} · sources=${snap.runtime.scanner.sources}`,
    `Browser: ${snap.runtime.browser.status.toUpperCase()} · online=${snap.runtime.browser.sessionsOnline}`,
    `Queue: ${snap.runtime.queue.queuedJobs} queued · ${snap.runtime.queue.runningJobs} running`,
    '',
    `Buyers Today: ${snap.sales.buyersToday}`,
    `Qualified: ${snap.sales.qualifiedToday}`,
    `Urgent: ${snap.sales.urgentBuyers}`,
    `Pipeline: ${snap.sales.pipelineValue} tỷ`,
    `Expected Revenue: ${snap.sales.expectedRevenue} tỷ`,
  ];
}
