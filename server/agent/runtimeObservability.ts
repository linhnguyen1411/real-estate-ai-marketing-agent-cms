/**
 * Read-only Automation Runtime observability aggregator.
 * No business mutations — DB + BrowserSession.metadata (worker heartbeat) only.
 */

import { prisma } from '../prisma';
import type { AuthUser } from '../../src/types';

const STALE_MS = 45_000;

function scorePart(ok: boolean, partial = false): number {
  if (ok) return 100;
  if (partial) return 50;
  return 0;
}

export async function buildAutomationRuntimeSnapshot(user: AuthUser) {
  const companyFilter =
    user.role === 'owner'
      ? {}
      : { companyId: user.company_id ?? '__none__' };

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    sessions,
    queueGroups,
    activeJobs,
    missionGroups,
    recentMissionRuns,
    campaignRuns,
    publishHour,
    scanHour,
    completedHour,
    failedHour,
    retriedJobs,
  ] = await Promise.all([
    prisma.browserSession.findMany({
      where: companyFilter,
      orderBy: { lastHeartbeatAt: 'desc' },
      take: 20,
    }),
    prisma.agentJob.groupBy({
      by: ['status'],
      where: companyFilter,
      _count: true,
    }),
    prisma.agentJob.findMany({
      where: {
        ...companyFilter,
        status: { in: ['queued', 'claimed', 'running'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        type: true,
        status: true,
        priority: true,
        claimedBy: true,
        missionRunId: true,
        startedAt: true,
        claimedAt: true,
        availableAt: true,
        createdAt: true,
        errorMessage: true,
      },
    }),
    prisma.agentMissionRun.groupBy({
      by: ['status'],
      where: companyFilter,
      _count: true,
    }),
    prisma.agentMissionRun.findMany({
      where: companyFilter,
      orderBy: { updatedAt: 'desc' },
      take: 25,
      select: {
        id: true,
        missionId: true,
        status: true,
        triggerType: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        error: true,
      },
    }),
    prisma.socialCampaignRun.findMany({
      where: companyFilter,
      orderBy: { updatedAt: 'desc' },
      take: 15,
      select: {
        id: true,
        campaignId: true,
        status: true,
        progress: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    prisma.agentJob.count({
      where: {
        ...companyFilter,
        type: 'publish_social',
        status: 'completed',
        finishedAt: { gte: hourAgo },
      },
    }),
    prisma.agentJob.count({
      where: {
        ...companyFilter,
        type: { in: ['scan_source', 'source_scan'] },
        status: 'completed',
        finishedAt: { gte: hourAgo },
      },
    }),
    prisma.agentJob.count({
      where: {
        ...companyFilter,
        status: 'completed',
        finishedAt: { gte: hourAgo },
      },
    }),
    prisma.agentJob.count({
      where: {
        ...companyFilter,
        status: 'failed',
        finishedAt: { gte: hourAgo },
      },
    }),
    prisma.agentJob.count({
      where: {
        ...companyFilter,
        attempts: { gt: 0 },
        updatedAt: { gte: dayAgo },
      },
    }),
  ]);

  const queue: Record<string, number> = {
    waiting: 0,
    claimed: 0,
    running: 0,
    retry: 0,
    deadLetter: 0,
    cancelled: 0,
    completed: 0,
  };
  for (const g of queueGroups) {
    const n = g._count;
    if (g.status === 'queued') queue.waiting += n;
    else if (g.status === 'claimed') queue.claimed += n;
    else if (g.status === 'running') queue.running += n;
    else if (g.status === 'failed') queue.deadLetter += n;
    else if (g.status === 'cancelled') queue.cancelled += n;
    else if (g.status === 'completed') queue.completed += n;
  }
  // Retry approximation: queued jobs with prior attempts or errorMessage set
  queue.retry = activeJobs.filter(
    j => j.status === 'queued' && (j.errorMessage || (j.availableAt && j.availableAt > now)),
  ).length;

  const missions: Record<string, number> = {
    waiting: 0,
    running: 0,
    retry: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const g of missionGroups) {
    const n = g._count;
    const s = g.status;
    if (s === 'queued' || s === 'pending') missions.waiting += n;
    else if (s === 'running' || s === 'started') missions.running += n;
    else if (s === 'completed' || s === 'completed_with_errors') missions.completed += n;
    else if (s === 'failed') missions.failed += n;
    else if (s === 'cancelled') missions.cancelled += n;
    else missions.waiting += n;
  }

  const workers = sessions.map(s => {
    const age = s.lastHeartbeatAt
      ? now.getTime() - new Date(s.lastHeartbeatAt).getTime()
      : Number.POSITIVE_INFINITY;
    const online =
      s.status !== 'offline' &&
      s.status !== 'needs_login' &&
      age <= STALE_MS;
    const meta =
      s.metadata && typeof s.metadata === 'object' && !Array.isArray(s.metadata)
        ? (s.metadata as Record<string, unknown>)
        : {};
    return {
      id: s.id,
      workerId: s.workerId,
      name: s.name,
      status: s.status,
      lastHeartbeatAt: s.lastHeartbeatAt,
      currentUrl: s.currentUrl,
      lastError: s.lastError,
      online,
      heartbeatAgeMs: Number.isFinite(age) ? age : null,
      runtime: {
        mode: meta.mode ?? null,
        executionPool: meta.executionPool ?? null,
        browserPool: meta.browserPool ?? null,
        resources: meta.resources ?? null,
        process: meta.process ?? null,
        publishedAt: meta.publishedAt ?? null,
      },
    };
  });

  const onlineWorkers = workers.filter(w => w.online).length;
  const hasPool =
    workers.some(
      w =>
        Array.isArray(w.runtime.executionPool) &&
        (w.runtime.executionPool as unknown[]).length > 0,
    );

  const terminalHour = completedHour + failedHour;
  const successRate =
    terminalHour > 0 ? Math.round((completedHour / terminalHour) * 1000) / 10 : null;
  const retryRate =
    terminalHour + retriedJobs > 0
      ? Math.round((retriedJobs / Math.max(1, terminalHour + retriedJobs)) * 1000) / 10
      : null;

  // Slot / browser utilization from freshest online worker metadata
  const liveWorker = workers.find(w => w.online && w.runtime.executionPool) || workers[0];
  const slots = Array.isArray(liveWorker?.runtime.executionPool)
    ? (liveWorker!.runtime.executionPool as Array<Record<string, unknown>>)
    : [];
  const processMeta =
    liveWorker?.runtime.process &&
    typeof liveWorker.runtime.process === 'object' &&
    !Array.isArray(liveWorker.runtime.process)
      ? (liveWorker.runtime.process as Record<string, unknown>)
      : null;
  const browsers: Array<Record<string, unknown>> = (
    Array.isArray(liveWorker?.runtime.browserPool)
      ? (liveWorker!.runtime.browserPool as Array<Record<string, unknown>>)
      : []
  ).map(b => ({
    ...b,
    // Chrome OS CPU/mem not instrumented in MVP — surface worker process RSS as proxy.
    memoryMb: processMeta?.rssMb ?? null,
    cpuPercent: null,
  }));

  let slotUtil = 0;
  let slotCap = 0;
  for (const s of slots) {
    const max = Number(s.maxConcurrency) || 0;
    const run = Number(s.runningJobs) || 0;
    if (max > 0) {
      slotCap += max;
      slotUtil += run;
    }
  }
  const slotUtilization =
    slotCap > 0 ? Math.round((slotUtil / slotCap) * 1000) / 10 : null;

  const leasedBrowsers = browsers.filter(b => {
    const s = String(b.state || '');
    return s === 'leased' || s === 'active' || s === 'leasing' || Boolean(b.ownerJob);
  }).length;
  const browserUtilization =
    browsers.length > 0
      ? Math.round((leasedBrowsers / browsers.length) * 1000) / 10
      : null;

  const health = {
    worker: scorePart(onlineWorkers > 0, workers.length > 0),
    browser: scorePart(
      browsers.some(b => b.state === 'idle' || b.state === 'leased'),
      hasPool,
    ),
    queue: scorePart(queue.deadLetter < 50, queue.waiting < 200),
    mission: scorePart(missions.failed < missions.completed + 5, true),
    scheduler: scorePart(queue.waiting + queue.running + queue.claimed >= 0, true),
  };
  const healthScore = Math.round(
    (health.worker + health.browser + health.queue + health.mission + health.scheduler) / 5,
  );

  const campaigns = campaignRuns.map(r => {
    const progress =
      r.progress && typeof r.progress === 'object' && !Array.isArray(r.progress)
        ? (r.progress as Record<string, number>)
        : {};
    const total = Number(progress.total) || 0;
    const completed = Number(progress.completed) || 0;
    const failed = Number(progress.failed) || 0;
    const publishing = Number(progress.publishing) || 0;
    const pending = Number(progress.pending) || 0;
    const done = completed + failed;
    let etaSec: number | null = null;
    if (r.startedAt && done > 0 && done < total) {
      const elapsed = (now.getTime() - new Date(r.startedAt).getTime()) / 1000;
      const rate = done / Math.max(1, elapsed);
      etaSec = Math.round((total - done) / Math.max(0.0001, rate));
    }
    return {
      id: r.id,
      campaignId: r.campaignId,
      status: r.status,
      progress: {
        total,
        completed,
        failed,
        publishing,
        pending,
        skipped: Number(progress.skipped) || 0,
      },
      success: completed,
      failed,
      partialSuccess: r.status === 'partial_success',
      etaSec,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
    };
  });

  return {
    generatedAt: now.toISOString(),
    healthScore,
    health,
    workers,
    slots,
    browsers,
    process: liveWorker?.runtime.process ?? null,
    queue,
    activeJobs,
    missions,
    missionTimeline: recentMissionRuns,
    campaigns,
    metrics: {
      publishPerHour: publishHour,
      scanPerHour: scanHour,
      successRate,
      retryRate,
      browserUtilization,
      slotUtilization,
      completedLastHour: completedHour,
      failedLastHour: failedHour,
    },
  };
}
