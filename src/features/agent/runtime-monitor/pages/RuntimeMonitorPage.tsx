/**
 * Operations Center — Mission Control UI (presentation only).
 * Data: GET /api/agent/runtime snapshot. Refresh: manual + 30s live metrics.
 */
import React, { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAutomationRuntime } from '../../../../services/agentPlatformApi';
import type {
  AutomationRuntimeSnapshot,
  OperationsMetricsSnapshot,
} from '../../../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelLoader,
} from '../../shared/AgentPlatformUi';
import { OpsCenterHeader } from '../components/OpsCenterHeader';
import { FleetPanel } from '../components/FleetPanel';
import {
  BrowserPanel,
  MissionPanel,
  PublisherPanel,
  ScannerPanel,
} from '../components/OperationsPanels';
import { ActivityTimeline, AlertsPanel, QuickActions } from '../components/ActivityAlerts';
import { Accordion, SkeletonBlock } from '../components/OpsPrimitives';
import {
  deriveFallbackTimeline,
  deriveOpsAlerts,
  mapRuntimeEventsToTimeline,
} from '../utils/deriveAlerts';

const REFRESH_MS = 30 * 1000;

function dedupeMachinesByHost(
  machines: OperationsMetricsSnapshot['machines'],
): OperationsMetricsSnapshot['machines'] {
  const byKey = new Map<string, OperationsMetricsSnapshot['machines'][number]>();
  for (const m of machines) {
    const key = (m.machineId || m.hostname || m.agentId).toLowerCase();
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, m);
      continue;
    }
    const prevOnline = prev.status === 'online' || prev.status === 'degraded' ? 1 : 0;
    const nextOnline = m.status === 'online' || m.status === 'degraded' ? 1 : 0;
    if (nextOnline > prevOnline) {
      byKey.set(key, m);
      continue;
    }
    if (
      nextOnline === prevOnline &&
      (m.running || 0) + (m.waiting || 0) > (prev.running || 0) + (prev.waiting || 0)
    ) {
      byKey.set(key, m);
    }
  }
  return [...byKey.values()];
}

function overlayActiveJobs(
  machines: OperationsMetricsSnapshot['machines'],
  activeJobs: AutomationRuntimeSnapshot['activeJobs'] | undefined,
): OperationsMetricsSnapshot['machines'] {
  if (!activeJobs?.length) return machines;
  return machines.map(m => {
    const mine = activeJobs.filter(
      j => j.claimedBy && (j.claimedBy === m.agentId || j.claimedBy === m.machineId),
    );
    if (!mine.length) return m;
    const running = mine.filter(j => j.status === 'running' || j.status === 'claimed').length;
    const scanRunning = mine.filter(
      j =>
        (j.status === 'running' || j.status === 'claimed') &&
        (j.type === 'scan_source' || j.type === 'source_scan'),
    ).length;
    return {
      ...m,
      running: Math.max(m.running || 0, running),
      assigned: Math.max(m.assigned || 0, running),
      currentStep: mine[0]?.type || m.currentStep,
      activity:
        scanRunning > 0
          ? 'scanning'
          : running > 0 && m.activity === 'idle'
            ? 'busy'
            : m.activity,
    };
  });
}

function machinesFromWorkers(
  data: AutomationRuntimeSnapshot,
): OperationsMetricsSnapshot['machines'] {
  return dedupeMachinesByHost(
    (data.workers || [])
      .filter(w => w.online)
      .map(w => {
        const proc =
          w.runtime?.process && typeof w.runtime.process === 'object'
            ? (w.runtime.process as Record<string, unknown>)
            : {};
        const jobs = (data.activeJobs || []).filter(
          j => j.claimedBy && (j.claimedBy === w.workerId || j.claimedBy === w.id),
        );
        const host = w.name || w.workerId || w.id;
        return {
          agentId: w.workerId || w.id,
          hostname: host,
          machineId: w.workerId || w.id,
          displayName: host,
          status: w.online ? 'online' : 'offline',
          activity: w.online
            ? jobs.some(j => j.type === 'scan_source' || j.type === 'source_scan')
              ? 'scanning'
              : jobs.length
                ? 'busy'
                : 'idle'
            : 'offline',
          assigned: jobs.length,
          running: jobs.filter(j => j.status === 'running' || j.status === 'claimed').length,
          completed: 0,
          waiting: 0,
          cpuLoad1m: null,
          memFreeMb: null,
          memTotalMb: null,
          rssMb: typeof proc.rssMb === 'number' ? proc.rssMb : null,
          heapUsedMb: typeof proc.heapUsedMb === 'number' ? proc.heapUsedMb : null,
          chromeCount: Array.isArray(w.runtime?.browserPool)
            ? (w.runtime.browserPool as unknown[]).length
            : 0,
          browserBusy: 0,
          browserIdle: 0,
          executionSlots: 1,
          missionName: jobs[0]?.missionRunId || null,
          currentStep: jobs[0]?.type || null,
          heartbeatAgeMs: w.heartbeatAgeMs,
        };
      }),
  );
}

class RuntimeErrorBoundary extends Component<
  { children: React.ReactNode; onRetry: () => void },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : 'Runtime UI crashed' };
  }

  render() {
    if (this.state.error) {
      return (
        <AgentPanelError
          message={`Operations Center lỗi: ${this.state.error}`}
          onRetry={() => {
            this.setState({ error: null });
            this.props.onRetry();
          }}
        />
      );
    }
    return this.props.children;
  }
}

function emptyOps(data: AutomationRuntimeSnapshot): OperationsMetricsSnapshot {
  const machines = machinesFromWorkers(data);
  return {
    schemaVersion: 1,
    generatedAt: data.generatedAt,
    refreshReason: 'dashboard',
    companyId: null,
    fleet: {
      machinesOnline: machines.filter(m => m.status === 'online').length,
      machinesOffline: machines.filter(m => m.status === 'offline').length,
      machinesBusy: machines.filter(m => m.activity === 'busy').length,
      machinesIdle: machines.filter(m => m.activity === 'idle').length,
      cpuAvg: null,
      ramUsedPctAvg: null,
      browserBusy: 0,
      browserIdle: 0,
      healthScore: data.healthScore,
    },
    scanner: {
      sources: 0,
      assigned: 0,
      running: data.metrics.scanPerHour > 0 ? 1 : 0,
      completed: 0,
      findingsToday: 0,
      postsScanned: 0,
    },
    publisher: {
      draft: 0,
      queue: data.queue.waiting,
      publishing: data.queue.running,
      publishedToday: 0,
      retry: data.queue.retry,
    },
    mission: {
      running: data.missions.running,
      waiting: data.missions.waiting,
      completed: data.missions.completed,
      failed: data.missions.failed,
    },
    workload: {
      totalScanSources: 0,
      assignedSources: 0,
      completedSources: 0,
      runningMissions: data.missions.running,
      runningPublishJobs: 0,
      runningCampaigns: data.campaigns?.length || 0,
      waitingJobs: data.queue.waiting,
      retryJobs: data.queue.retry,
      failedJobs: data.queue.deadLetter,
    },
    machines,
  };
}

function OpsCenterSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <SkeletonBlock className="h-28" />
      <div className="grid gap-4 lg:grid-cols-12">
        <SkeletonBlock className="h-64 lg:col-span-4" />
        <SkeletonBlock className="h-64 lg:col-span-5" />
        <SkeletonBlock className="h-64 lg:col-span-3" />
      </div>
    </div>
  );
}

function RuntimeMonitorInner() {
  const [data, setData] = useState<AutomationRuntimeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean; refresh?: boolean }) => {
    const silent = opts?.silent === true;
    const refresh = opts?.refresh === true;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await fetchAutomationRuntime({ refresh });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được Operations Center.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load({ refresh: true });
    const t = setInterval(() => load({ silent: true, refresh: true }), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const ops = useMemo(() => {
    if (!data) return null;
    const base =
      data.operations?.machines && data.operations.machines.length > 0
        ? data.operations
        : data.operations
          ? {
              ...data.operations,
              machines: machinesFromWorkers(data),
              fleet: {
                ...data.operations.fleet,
                machinesOnline: (data.workers || []).filter(w => w.online).length,
                machinesOffline: 0,
              },
            }
          : emptyOps(data);

    const machines = overlayActiveJobs(
      dedupeMachinesByHost(base.machines || []),
      data.activeJobs,
    );
    const online = machines.filter(m => m.status === 'online' || m.status === 'degraded');
    const busy = machines.filter(m =>
      ['busy', 'scanning', 'publishing', 'campaign', 'browser_hold'].includes(m.activity),
    );
    return {
      ...base,
      machines,
      fleet: {
        ...base.fleet,
        machinesOnline: online.length,
        machinesOffline: Math.max(0, machines.length - online.length),
        machinesBusy: busy.length,
        machinesIdle: machines.filter(m => m.activity === 'idle').length,
      },
    };
  }, [data]);

  const alerts = useMemo(
    () => (data && ops ? deriveOpsAlerts(data, ops) : []),
    [data, ops],
  );

  const timeline = useMemo(() => {
    if (!data) return [];
    const fromEvents = mapRuntimeEventsToTimeline(data.events || []);
    return fromEvents.length > 0 ? fromEvents : deriveFallbackTimeline(data);
  }, [data]);

  const browsers = useMemo(() => {
    const raw = (data?.browsers || []) as Array<Record<string, unknown>>;
    return raw;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <AgentPanelLoader label="Đang tải Automation Operations Center..." />
        <OpsCenterSkeleton />
      </div>
    );
  }

  if (error && !data) {
    return <AgentPanelError message={error} onRetry={() => load({ refresh: true })} />;
  }

  if (!data || !ops) {
    return <AgentPanelEmpty title="Chưa có runtime snapshot" />;
  }

  const fleetOnline = ops.fleet.machinesOnline;
  const fleetTotal = ops.machines.length || ops.fleet.machinesOnline + ops.fleet.machinesOffline;
  const onRefresh = () => load({ silent: true, refresh: true });

  const operationsColumn = (
    <div className="space-y-4">
      <ScannerPanel scanner={ops.scanner} machines={ops.machines} />
      <PublisherPanel
        publisher={ops.publisher}
        machines={ops.machines}
        campaigns={data.campaigns || []}
      />
      <MissionPanel
        mission={ops.mission}
        timeline={data.missionTimeline || []}
        machines={ops.machines}
      />
      <BrowserPanel
        browsers={browsers}
        fleetBrowserBusy={ops.fleet.browserBusy}
        fleetBrowserIdle={ops.fleet.browserIdle}
      />
    </div>
  );

  const sideColumn = (
    <div className="space-y-4">
      <QuickActions onRefresh={onRefresh} refreshing={refreshing} />
      <AlertsPanel alerts={alerts} />
      <ActivityTimeline items={timeline} />
    </div>
  );

  return (
    <div className="space-y-4">
      <OpsCenterHeader
        healthScore={ops.fleet.healthScore || data.healthScore}
        fleetOnline={fleetOnline}
        fleetTotal={fleetTotal}
        fleetBusy={ops.fleet.machinesBusy}
        lastSnapshot={ops.generatedAt || data.generatedAt}
        refreshReason={ops.refreshReason}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      {error && (
        <p className="text-xs text-amber-300">Làm mới gần nhất lỗi: {error}</p>
      )}

      {/* Mobile: stacked accordions — no horizontal scroll */}
      <div className="space-y-3 lg:hidden">
        <Accordion
          title="Fleet"
          defaultOpen
          badge={
            <span className="text-[10px] text-slate-500">
              {fleetOnline}/{fleetTotal}
            </span>
          }
        >
          <FleetPanel machines={ops.machines} embedded />
        </Accordion>
        <Accordion title="Operations" defaultOpen>
          {operationsColumn}
        </Accordion>
        <Accordion title="Timeline & Alerts" defaultOpen>
          {sideColumn}
        </Accordion>
      </div>

      {/* Desktop: 3 columns — Fleet | Operations | Timeline+Alerts */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-12">
        <div className="lg:col-span-4 xl:col-span-3">
          <FleetPanel machines={ops.machines} />
        </div>
        <div className="lg:col-span-5 xl:col-span-5">{operationsColumn}</div>
        <div className="lg:col-span-3 xl:col-span-4">{sideColumn}</div>
      </div>

      <p className="text-[10px] text-slate-600">
        Policy · {data.controlPlane?.metricsPolicy || '5m + manual'} · snapshot read-only · UI only
      </p>
    </div>
  );
}

export default function RuntimeMonitorPage() {
  const [nonce, setNonce] = useState(0);
  return (
    <RuntimeErrorBoundary onRetry={() => setNonce(n => n + 1)}>
      <RuntimeMonitorInner key={nonce} />
    </RuntimeErrorBoundary>
  );
}
