/**
 * Compose Executive Command Center V2 snapshot from real data sources.
 */

import { prisma } from '../../prisma';
import { evaluateSourceQuality } from './sourceQualityService';
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

const STALE_AFTER_SECONDS = 120;

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

export async function buildExecutiveSnapshot(): Promise<ExecutiveSnapshot> {
  const generatedAt = new Date();
  const todayStart = new Date(generatedAt);
  todayStart.setHours(0, 0, 0, 0);
  const last24h = new Date(Date.now() - 24 * 3600_000);

  const [opsSnap, runtimeSnap, salesMetrics, urgentBundle, browserSessions, sources, sourceJobs, sourceCounts] =
    await Promise.all([
      import('../control-plane/operationsService')
        .then(m => m.opsGetOperationsMetrics({ refresh: false, reason: 'dashboard' }))
        .catch(() => null),
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
      import('../sales-layer')
        .then(m => m.getSalesPipelineMetrics({ sinceHours: 24 * 30 }))
        .catch(() => null),
      import('../sales-layer')
        .then(m => m.getUrgentBuyersBundle({ sinceHours: 24 * 30, page: 0, limit: 200 }))
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

  const sourcePerformance: SourcePerformanceRow[] = [];
  const scanSchedule: ScanScheduleRow[] = [];
  for (const source of sources) {
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
      sourceName: source.name,
      sourceType: source.type,
      sourceUrl: source.url,
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
  const buyersToday = recentBuyers.filter(b => Date.parse(b.createdAt) >= todayStart.getTime()).length;
  const qualifiedToday = salesMetrics?.qualified || 0;
  const urgentBuyers = urgentBundle?.total || salesMetrics?.urgentBuyers || 0;
  const pipelineValue = salesMetrics?.pipelineValueTy || 0;
  const expectedRevenue = salesMetrics?.expectedRevenueTy || 0;

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

  return {
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
  };
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
