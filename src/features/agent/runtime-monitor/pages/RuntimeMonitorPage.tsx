/**
 * Runtime Monitor — read-only Automation Observability dashboard.
 * Lazy-loaded under Agent Platform. No business mutations.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { fetchAutomationRuntime } from '../../../../services/agentPlatformApi';
import type { AutomationRuntimeSnapshot } from '../../../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  AgentStatCard,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

const POLL_MS = 8_000;

function pct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v}%`;
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

export default function RuntimeMonitorPage() {
  const [data, setData] = useState<AutomationRuntimeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await fetchAutomationRuntime();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được Runtime Monitor.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return <AgentPanelLoader label="Đang tải Runtime Monitor..." />;
  }

  if (error && !data) {
    return <AgentPanelError message={error} onRetry={() => load()} />;
  }

  if (!data) {
    return <AgentPanelEmpty title="Chưa có runtime snapshot" />;
  }

  const m = data.metrics;
  const q = data.queue;
  const missions = data.missions;

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Runtime Monitor"
        subtitle="Quan sát Worker · Execution Pool · Browser Pool · Mission · Queue · Campaign (read-only)"
        onRefresh={() => load(true)}
        refreshing={refreshing}
        actions={
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
            <Activity className="h-3.5 w-3.5 text-rose-400" />
            Health {data.healthScore}
          </div>
        }
      />

      {error && (
        <p className="text-xs text-amber-300">Làm mới gần nhất lỗi: {error}</p>
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

      <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-5">
        {(
          [
            ['Worker', data.health.worker],
            ['Browser', data.health.browser],
            ['Queue', data.health.queue],
            ['Mission', data.health.mission],
            ['Scheduler', data.health.scheduler],
          ] as const
        ).map(([label, score]) => (
          <div key={label} className="rounded-lg border border-slate-800 px-3 py-2">
            <div className="font-semibold text-slate-300">{label}</div>
            <div className="tabular-nums text-slate-500">{score}/100</div>
          </div>
        ))}
      </div>

      <Section title="Workers">
        <MiniTable
          headers={['Worker', 'Status', 'Online', 'URL', 'Heartbeat', 'RSS MB']}
          rows={data.workers.map(w => {
            const proc =
              w.runtime.process && typeof w.runtime.process === 'object'
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

      <Section title="Execution Pool">
        <MiniTable
          headers={[
            'Slot',
            'Type',
            'Running',
            'Queue',
            'Busy %',
            'Avg runtime',
            'Failures',
          ]}
          rows={(data.slots as Array<Record<string, unknown>>).map(s => [
            String(s.kind ?? '—'),
            String(s.status ?? '—'),
            String(s.runningJobs ?? 0),
            String(s.queuedWaiters ?? 0),
            pct(typeof s.busyPercent === 'number' ? s.busyPercent : null),
            s.avgRuntimeMsSinceBoot != null ? `${s.avgRuntimeMsSinceBoot} ms` : '—',
            String(s.failedSinceBoot ?? 0),
          ])}
        />
      </Section>

      <Section title="Browser Pool">
        <MiniTable
          headers={[
            'Browser ID',
            'Purpose',
            'State',
            'Mission',
            'Job',
            'Lease',
            'Memory',
            'CPU',
            'Heartbeat',
          ]}
          rows={(data.browsers as Array<Record<string, unknown>>).map(b => [
            String(b.browserId ?? '—'),
            String(b.purpose ?? '—'),
            String(b.state ?? '—'),
            b.ownerMission ? String(b.ownerMission).slice(0, 12) : '—',
            b.ownerJob ? String(b.ownerJob).slice(0, 12) : '—',
            b.leaseAgeSec != null ? `${b.leaseAgeSec}s` : '—',
            b.memoryMb != null ? `${b.memoryMb} MB` : '—',
            b.cpuPercent != null ? pct(Number(b.cpuPercent)) : 'n/a',
            b.heartbeatAt
              ? formatAgentDate(new Date(Number(b.heartbeatAt)).toISOString())
              : '—',
          ])}
        />
        <p className="mt-2 text-[11px] text-slate-500">
          Memory = worker process RSS (proxy). Chrome OS CPU chưa instrument trong MVP.
        </p>
      </Section>

      <Section title="Mission Runtime">
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
          rows={data.missionTimeline.map(r => [
            r.id.slice(0, 10),
            r.status,
            formatAgentDate(r.startedAt),
            formatAgentDate(r.updatedAt),
            r.error ? String(r.error).slice(0, 40) : '—',
          ])}
        />
      </Section>

      <Section title="Campaign Runtime">
        <MiniTable
          headers={[
            'Run',
            'Status',
            'Progress',
            'Targets',
            'Success',
            'Failed',
            'Partial',
            'ETA',
          ]}
          rows={data.campaigns.map(c => [
            c.id.slice(0, 10),
            c.status,
            c.progress.total > 0
              ? `${Math.round(
                  ((c.progress.completed + c.progress.failed) / c.progress.total) * 100,
                )}%`
              : '—',
            String(c.progress.total),
            String(c.success),
            String(c.failed),
            c.partialSuccess ? 'yes' : 'no',
            c.etaSec != null ? `${c.etaSec}s` : '—',
          ])}
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
            rows={data.activeJobs.map(j => [
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

      <Section title="Metrics">
        <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-3 lg:grid-cols-6">
          <div>Publish/hour: <span className="text-slate-200">{m.publishPerHour}</span></div>
          <div>Scan/hour: <span className="text-slate-200">{m.scanPerHour}</span></div>
          <div>Success: <span className="text-slate-200">{pct(m.successRate)}</span></div>
          <div>Retry: <span className="text-slate-200">{pct(m.retryRate)}</span></div>
          <div>Browser util: <span className="text-slate-200">{pct(m.browserUtilization)}</span></div>
          <div>Slot util: <span className="text-slate-200">{pct(m.slotUtilization)}</span></div>
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          Snapshot {formatAgentDate(data.generatedAt)} · poll {POLL_MS / 1000}s
        </p>
      </Section>
    </div>
  );
}
