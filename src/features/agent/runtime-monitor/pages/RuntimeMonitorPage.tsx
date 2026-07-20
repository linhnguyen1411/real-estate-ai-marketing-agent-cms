/**
 * Runtime Monitor / Operations Center — Metrics Snapshot dashboard.
 * Refresh policy: manual + 5 minutes (no continuous polling).
 */
import React, { Component, useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { fetchAutomationRuntime } from '../../../../services/agentPlatformApi';
import type {
  AutomationRuntimeSnapshot,
  OperationsMetricsSnapshot,
} from '../../../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  AgentStatCard,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

/** Align with Metrics Collector default (5 minutes). */
const REFRESH_MS = 5 * 60 * 1000;

function pct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${Math.round(v)}%`;
}

function n(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      <h3 className="text-sm font-bold text-slate-200">{title}</h3>
      {children}
    </section>
  );
}

function MiniTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">Không có dữ liệu realtime.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-slate-500">
            {headers.map(h => (
              <th key={h} className="px-2 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-900/80 text-slate-300">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-2 align-top tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
          message={`Runtime Dashboard lỗi: ${this.state.error}`}
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

function OperationsBlocks({ ops }: { ops: OperationsMetricsSnapshot }) {
  const f = ops.fleet;
  const s = ops.scanner;
  const p = ops.publisher;
  const m = ops.mission;
  return (
    <>
      <Section title="Fleet">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <AgentStatCard label="Online" value={f.machinesOnline} tone="success" />
          <AgentStatCard label="Busy" value={f.machinesBusy} tone="warning" />
          <AgentStatCard label="Idle" value={f.machinesIdle} />
          <AgentStatCard label="Offline" value={f.machinesOffline} />
          <AgentStatCard label="CPU Avg" value={n(f.cpuAvg)} />
          <AgentStatCard label="RAM Used %" value={pct(f.ramUsedPctAvg)} />
          <AgentStatCard label="Browser Busy" value={f.browserBusy} tone="warning" />
          <AgentStatCard label="Browser Idle" value={f.browserIdle} tone="success" />
        </div>
      </Section>

      <Section title="Scanner">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <AgentStatCard label="Sources" value={s.sources} />
          <AgentStatCard label="Assigned" value={s.assigned} />
          <AgentStatCard label="Running" value={s.running} tone="warning" />
          <AgentStatCard label="Completed" value={s.completed} tone="success" />
          <AgentStatCard label="Findings Today" value={s.findingsToday} />
          <AgentStatCard label="Posts Scanned" value={s.postsScanned} />
        </div>
      </Section>

      <Section title="Publisher">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <AgentStatCard label="Draft" value={p.draft} />
          <AgentStatCard label="Queue" value={p.queue} />
          <AgentStatCard label="Publishing" value={p.publishing} tone="warning" />
          <AgentStatCard label="Published Today" value={p.publishedToday} tone="success" />
          <AgentStatCard label="Retry" value={p.retry} tone="danger" />
        </div>
      </Section>

      <Section title="Mission">
        <div className="grid gap-2 sm:grid-cols-4">
          <AgentStatCard label="Running" value={m.running} tone="warning" />
          <AgentStatCard label="Waiting" value={m.waiting} />
          <AgentStatCard label="Completed" value={m.completed} tone="success" />
          <AgentStatCard label="Failed" value={m.failed} tone="danger" />
        </div>
      </Section>

      <Section title="Machines / Work">
        <MiniTable
          headers={[
            'Machine',
            'Status',
            'Activity',
            'CPU',
            'RAM',
            'Jobs',
            'Done',
            'Browser',
            'Mission',
          ]}
          rows={ops.machines.map(row => [
            row.displayName || row.hostname,
            row.status,
            row.activity,
            n(row.cpuLoad1m),
            row.memFreeMb != null && row.memTotalMb != null
              ? `${row.memFreeMb}/${row.memTotalMb}`
              : n(row.rssMb),
            `${row.running}/${row.waiting}`,
            String(row.completed),
            `${row.browserBusy}/${row.browserIdle}`,
            row.missionName || '—',
          ])}
        />
      </Section>
    </>
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
      setError(err instanceof Error ? err.message : 'Không tải được Runtime Monitor.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load({ refresh: false });
    const t = setInterval(() => load({ silent: true, refresh: false }), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return <AgentPanelLoader label="Đang tải Operations Center..." />;
  }

  if (error && !data) {
    return <AgentPanelError message={error} onRetry={() => load({ refresh: true })} />;
  }

  if (!data) {
    return <AgentPanelEmpty title="Chưa có runtime snapshot" />;
  }

  const m = data.metrics;
  const q = data.queue;
  const missions = data.missions;
  const ops = data.operations;

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Operations Center · Runtime"
        subtitle="Metrics Snapshot — Fleet · Scanner · Publisher · Mission (không poll agent trực tiếp)"
        onRefresh={() => load({ silent: true, refresh: true })}
        refreshing={refreshing}
        actions={
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
            <Activity className="h-3.5 w-3.5 text-rose-400" />
            Health {ops?.fleet.healthScore ?? data.healthScore}
          </div>
        }
      />

      {error && (
        <p className="text-xs text-amber-300">Làm mới gần nhất lỗi: {error}</p>
      )}

      {ops ? (
        <OperationsBlocks ops={ops} />
      ) : (
        <p className="text-xs text-slate-500">
          Operations metrics chưa có — nhấn Refresh để thu thập snapshot.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <AgentStatCard label="Health Score" value={data.healthScore} tone="success" />
        <AgentStatCard label="Publish/hour" value={m.publishPerHour} />
        <AgentStatCard label="Scan/hour" value={m.scanPerHour} />
        <AgentStatCard
          label="Success rate %"
          value={m.successRate == null ? 0 : Math.round(m.successRate)}
          tone="success"
        />
        <AgentStatCard
          label="Slot util %"
          value={m.slotUtilization == null ? 0 : Math.round(m.slotUtilization)}
          tone="warning"
        />
      </div>

      <Section title="Workers">
        <MiniTable
          headers={['Worker', 'Status', 'Online', 'URL', 'Heartbeat', 'RSS MB']}
          rows={(data.workers || []).map(w => {
            const proc =
              w.runtime?.process && typeof w.runtime.process === 'object'
                ? (w.runtime.process as Record<string, unknown>)
                : {};
            return [
              w.workerId || w.name,
              w.status,
              w.online ? 'yes' : 'no',
              w.currentUrl ? String(w.currentUrl).slice(0, 48) : '—',
              formatAgentDate(w.lastHeartbeatAt),
              proc.rssMb != null ? String(proc.rssMb) : '—',
            ];
          })}
        />
      </Section>

      <Section title="Queue">
        <div className="grid gap-2 sm:grid-cols-5">
          <AgentStatCard label="Waiting" value={q.waiting} />
          <AgentStatCard label="Claimed" value={q.claimed} />
          <AgentStatCard label="Running" value={q.running} tone="warning" />
          <AgentStatCard label="Retry" value={q.retry} />
          <AgentStatCard label="Dead Letter" value={q.deadLetter} tone="danger" />
        </div>
        <div className="mt-3">
          <MiniTable
            headers={['Job', 'Type', 'Status', 'Worker', 'Mission', 'Started']}
            rows={(data.activeJobs || []).map(j => [
              j.id.slice(0, 10),
              j.type,
              j.status,
              j.claimedBy || '—',
              j.missionRunId ? j.missionRunId.slice(0, 10) : '—',
              formatAgentDate(j.startedAt),
            ])}
          />
        </div>
      </Section>

      <Section title="Mission Timeline">
        <div className="mb-3 grid gap-2 sm:grid-cols-6">
          <AgentStatCard label="Waiting" value={missions.waiting} />
          <AgentStatCard label="Running" value={missions.running} />
          <AgentStatCard label="Retry" value={missions.retry} />
          <AgentStatCard label="Completed" value={missions.completed} tone="success" />
          <AgentStatCard label="Failed" value={missions.failed} tone="danger" />
          <AgentStatCard label="Cancelled" value={missions.cancelled} tone="warning" />
        </div>
        <MiniTable
          headers={['Run', 'Status', 'Started', 'Updated', 'Error']}
          rows={(data.missionTimeline || []).map(r => [
            r.id.slice(0, 10),
            r.status,
            formatAgentDate(r.startedAt),
            formatAgentDate(r.updatedAt),
            r.error ? String(r.error).slice(0, 40) : '—',
          ])}
        />
      </Section>

      <p className="text-[11px] text-slate-600">
        Snapshot {formatAgentDate(ops?.generatedAt || data.generatedAt)} · refresh policy{' '}
        {data.controlPlane?.metricsPolicy || '5m + manual'} · reason={ops?.refreshReason || '—'}
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
