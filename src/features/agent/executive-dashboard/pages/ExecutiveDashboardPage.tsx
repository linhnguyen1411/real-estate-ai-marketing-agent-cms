import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AgentPanelError, AgentPanelHeader, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type RuntimeState = 'online' | 'degraded' | 'offline';
type SourceFilter = 'ALL' | 'ACTIVE' | 'RUNNING' | 'QUEUED' | 'FAILED' | 'PAUSED' | 'OFFLINE' | 'STALE';
type SourceSort = 'quality' | 'buyers' | 'qualified' | 'leads' | 'nextScan';
type SourceRecommendation = 'PRIORITIZE' | 'KEEP' | 'REDUCE' | 'PAUSE' | 'DELETE';

type Snapshot = {
  generatedAt: string;
  freshness: { stale: boolean; ageSeconds: number };
  ai: { status: RuntimeState; reason: string; lastActivityAt: string | null; summary: string };
  runtime: {
    scanner: { status: RuntimeState; reason: string | null; sources: number; runningSources: number };
    browser: { status: RuntimeState; reason: string | null; sessionsOnline: number; sessionsOffline: number };
    worker: { status: RuntimeState; reason: string | null; activeWorkers: number };
    queue: { status: RuntimeState; reason: string | null; queuedJobs: number; runningJobs: number; failedJobs: number };
    scheduler: { status: RuntimeState; reason: string | null; tickIntervalMs: number | null };
  };
  sales: {
    buyersToday: number;
    qualifiedToday: number;
    urgentBuyers: number;
    pipelineValue: number;
    expectedRevenue: number;
    links: Record<string, string>;
  };
  sourcePerformance: Array<{
    sourceId: string;
    sourceName: string;
    sourceType: string;
    status: string;
    priority: number;
    qualityScore: number;
    recommendation: SourceRecommendation;
    recommendationReason: string;
    lastScanAt: string | null;
    nextScanAt: string | null;
    currentJobStatus: string | null;
    leads: number;
    buyers: number;
    qualified: number;
    leadRate: number;
    buyerRate: number;
    duplicateRate: number;
    failureRate: number;
    lastError: string | null;
    filters: { leads: string };
    actions: { scanNow: boolean; pause: boolean; resume: boolean };
  }>;
  scanSchedule: Array<{
    sourceId: string;
    sourceName: string;
    status: string;
    lastScanAt: string | null;
    nextScanAt: string | null;
    jobsQueued: number;
    jobsRunning: number;
    jobsFailed24h: number;
    postsScanned24h: number;
    leads24h: number;
  }>;
  recentBuyers: Array<{
    findingId: string;
    title: string;
    role: string | null;
    confidence: number;
    budget: string | null;
    location: string | null;
    source: string | null;
    nextAction: string | null;
    openLink: string;
  }>;
  attention: Array<{
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail: string;
    actionLabel: string | null;
    actionHref: string | null;
  }>;
  actions: {
    available: Array<{ id: string; label: string; href: string }>;
    unavailable: Array<{ id: string; label: string; reason: string | null }>;
  };
};

function stateBadge(s: RuntimeState): string {
  if (s === 'online') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (s === 'degraded') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
}

function sevDot(sev: 'critical' | 'warning' | 'info') {
  if (sev === 'critical') return 'bg-rose-500';
  if (sev === 'warning') return 'bg-amber-400';
  return 'bg-sky-400';
}

function fmtTime(v: string | null): string {
  return v ? new Date(v).toLocaleString() : 'N/A';
}

export default function ExecutiveDashboardPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<SourceFilter>('ALL');
  const [sortBy, setSortBy] = useState<SourceSort>('quality');
  const [search, setSearch] = useState('');
  const [busySourceId, setBusySourceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/executive/snapshot');
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Load failed');
      setSnap(json.data as Snapshot);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 30000);
    return () => window.clearInterval(t);
  }, [load]);

  const rows = useMemo(() => {
    if (!snap) return [];
    const q = search.trim().toLowerCase();
    const list = snap.sourcePerformance.filter(r => {
      const st = (r.status || '').toLowerCase();
      if (filter === 'ACTIVE' && st !== 'active') return false;
      if (filter === 'RUNNING' && r.currentJobStatus !== 'running' && r.currentJobStatus !== 'claimed') return false;
      if (filter === 'QUEUED' && r.currentJobStatus !== 'queued') return false;
      if (filter === 'FAILED' && r.failureRate <= 0) return false;
      if (filter === 'PAUSED' && st !== 'paused') return false;
      if (filter === 'OFFLINE' && !String(r.lastError || '').toLowerCase().includes('offline')) return false;
      if (filter === 'STALE' && !r.lastScanAt) return false;
      if (q && !`${r.sourceName} ${r.sourceType}`.toLowerCase().includes(q)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sortBy === 'quality') return b.qualityScore - a.qualityScore;
      if (sortBy === 'buyers') return b.buyers - a.buyers;
      if (sortBy === 'qualified') return b.qualified - a.qualified;
      if (sortBy === 'leads') return b.leads - a.leads;
      const av = a.nextScanAt ? Date.parse(a.nextScanAt) : Number.MAX_SAFE_INTEGER;
      const bv = b.nextScanAt ? Date.parse(b.nextScanAt) : Number.MAX_SAFE_INTEGER;
      return av - bv;
    });
    return list;
  }, [snap, filter, search, sortBy]);

  const sourceAction = useCallback(
    async (sourceId: string, action: 'scan' | 'pause' | 'resume') => {
      setBusySourceId(sourceId);
      setMessage(null);
      try {
        if (action === 'scan') {
          const res = await fetch(`/api/agent/sources/${sourceId}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          const json = await res.json();
          if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Scan failed');
          setMessage('Scan queued');
        } else {
          const status = action === 'pause' ? 'paused' : 'active';
          const res = await fetch(`/api/agent/sources/${sourceId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
          const json = await res.json();
          if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Update source failed');
          setMessage(action === 'pause' ? 'Source paused' : 'Source resumed');
        }
        await load();
      } catch (e: unknown) {
        setMessage(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setBusySourceId(null);
      }
    },
    [load],
  );

  if (loading && !snap) return <AgentPanelLoader label="Loading Executive Command Center..." />;
  if (error && !snap) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!snap) return null;

  return (
    <div className="space-y-4">
      <AgentPanelHeader
        title="Executive Command Center V2"
        subtitle="Audit → Reuse → Real Data"
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-100">AI SALES EMPLOYEE</p>
          <span className={`rounded border px-2 py-1 text-xs ${stateBadge(snap.ai.status)}`}>
            {snap.ai.status.toUpperCase()}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-300">{snap.ai.summary}</p>
        <p className="mt-1 text-xs text-slate-500">
          Last activity: {fmtTime(snap.ai.lastActivityAt)} · Snapshot: {fmtTime(snap.generatedAt)} ·{' '}
          <span className={snap.freshness.stale ? 'text-amber-300' : 'text-emerald-300'}>
            {snap.freshness.stale ? 'DATA STALE' : 'LIVE'}
          </span>
        </p>
      </section>

      <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="BUYERS TODAY" value={snap.sales.buyersToday} href={snap.sales.links.buyersToday} />
        <Kpi label="QUALIFIED" value={snap.sales.qualifiedToday} href={snap.sales.links.qualifiedToday} />
        <Kpi label="URGENT BUYERS" value={snap.sales.urgentBuyers} href={snap.sales.links.urgentBuyers} tone="warn" />
        <Kpi label="PIPELINE" value={`${snap.sales.pipelineValue} tỷ`} href={snap.sales.links.pipeline} />
        <Kpi label="EXPECTED REVENUE" value={`${snap.sales.expectedRevenue} tỷ`} href={snap.sales.links.expectedRevenue} />
      </section>

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <RuntimeBox name="Scanner" status={snap.runtime.scanner.status} detail={`${snap.runtime.scanner.runningSources} running / ${snap.runtime.scanner.sources}`} reason={snap.runtime.scanner.reason} />
        <RuntimeBox name="Browser" status={snap.runtime.browser.status} detail={`${snap.runtime.browser.sessionsOnline} online / ${snap.runtime.browser.sessionsOffline} offline`} reason={snap.runtime.browser.reason} />
        <RuntimeBox name="Worker" status={snap.runtime.worker.status} detail={`${snap.runtime.worker.activeWorkers} active`} reason={snap.runtime.worker.reason} />
        <RuntimeBox name="Queue" status={snap.runtime.queue.status} detail={`${snap.runtime.queue.queuedJobs} queued / ${snap.runtime.queue.runningJobs} running / ${snap.runtime.queue.failedJobs} failed`} reason={snap.runtime.queue.reason} />
        <RuntimeBox name="Scheduler" status={snap.runtime.scheduler.status} detail={snap.runtime.scheduler.tickIntervalMs ? `tick ${snap.runtime.scheduler.tickIntervalMs}ms` : 'tick n/a'} reason={snap.runtime.scheduler.reason} />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attention Center</h3>
        <div className="mt-3 space-y-2">
          {snap.attention.map((a, idx) => (
            <div key={`${a.title}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <span className={`h-2 w-2 rounded-full ${sevDot(a.severity)}`} />
                {a.title}
              </p>
              <p className="text-xs text-slate-400">{a.detail}</p>
              {a.actionHref && a.actionLabel ? (
                <Link to={a.actionHref} className="mt-1 inline-block rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">
                  {a.actionLabel}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source Operations</h3>
          <div className="flex flex-wrap gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search source..." className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200" />
            <select value={filter} onChange={e => setFilter(e.target.value as SourceFilter)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
              {['ALL', 'ACTIVE', 'RUNNING', 'QUEUED', 'FAILED', 'PAUSED', 'OFFLINE', 'STALE'].map(v => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SourceSort)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
              <option value="quality">Quality</option>
              <option value="buyers">Buyer Count</option>
              <option value="qualified">Qualified</option>
              <option value="leads">Lead Count</option>
              <option value="nextScan">Next Scan</option>
            </select>
          </div>
        </div>
        {message ? <p className="mt-2 text-xs text-sky-300">{message}</p> : null}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1">Source</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Score</th>
                <th className="px-2 py-1">Leads</th>
                <th className="px-2 py-1">Buyers</th>
                <th className="px-2 py-1">Qualified</th>
                <th className="px-2 py-1">Rates</th>
                <th className="px-2 py-1">Recommendation</th>
                <th className="px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.sourceId} className="border-t border-slate-800 align-top">
                  <td className="px-2 py-2">
                    <p className="font-semibold text-slate-100">{r.sourceName}</p>
                    <p className="text-slate-500">{r.sourceType}</p>
                  </td>
                  <td className="px-2 py-2 text-slate-300">
                    <p>{r.status}</p>
                    <p>priority {r.priority}</p>
                    <p>scan {r.currentJobStatus || '-'}</p>
                  </td>
                  <td className="px-2 py-2 text-slate-100">{r.qualityScore}</td>
                  <td className="px-2 py-2 text-slate-100">{r.leads}</td>
                  <td className="px-2 py-2 text-slate-100">{r.buyers}</td>
                  <td className="px-2 py-2 text-slate-100">{r.qualified}</td>
                  <td className="px-2 py-2 text-slate-400">
                    <p>Lead {r.leadRate}%</p>
                    <p>Buyer {r.buyerRate}%</p>
                    <p>Fail {r.failureRate}%</p>
                    <p>Dup {r.duplicateRate}%</p>
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-semibold text-slate-100">{r.recommendation}</p>
                    <p className="text-[10px] text-slate-500">{r.recommendationReason}</p>
                    <p className="text-[10px] text-slate-500">last {fmtTime(r.lastScanAt)}</p>
                    <p className="text-[10px] text-slate-500">next {fmtTime(r.nextScanAt)}</p>
                    {r.lastError ? <p className="text-[10px] text-rose-300">{r.lastError}</p> : null}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.actions.scanNow ? (
                        <button type="button" disabled={busySourceId === r.sourceId} onClick={() => void sourceAction(r.sourceId, 'scan')} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800">
                          Scan Now
                        </button>
                      ) : null}
                      {r.actions.pause ? (
                        <button type="button" disabled={busySourceId === r.sourceId} onClick={() => void sourceAction(r.sourceId, 'pause')} className="rounded border border-amber-700 px-2 py-1 text-[10px] text-amber-300">
                          Pause
                        </button>
                      ) : null}
                      {r.actions.resume ? (
                        <button type="button" disabled={busySourceId === r.sourceId} onClick={() => void sourceAction(r.sourceId, 'resume')} className="rounded border border-emerald-700 px-2 py-1 text-[10px] text-emerald-300">
                          Resume
                        </button>
                      ) : null}
                      <Link to={r.filters.leads} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800">
                        View Leads
                      </Link>
                      <Link to={`/admin/agents/jobs?sourceId=${encodeURIComponent(r.sourceId)}`} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800">
                        History
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scan Schedule</h3>
          <div className="mt-3 space-y-2">
            {snap.scanSchedule.slice(0, 10).map(r => (
              <div key={r.sourceId} className="rounded border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-300">
                <p className="font-semibold text-slate-100">
                  {r.sourceName} · {r.status.toUpperCase()}
                </p>
                <p>
                  last {fmtTime(r.lastScanAt)} · next {fmtTime(r.nextScanAt)}
                </p>
                <p>
                  q/r/f {r.jobsQueued}/{r.jobsRunning}/{r.jobsFailed24h} · posts {r.postsScanned24h} · leads {r.leads24h}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Buyers</h3>
          <div className="mt-3 space-y-2">
            {snap.recentBuyers.slice(0, 10).map(b => (
              <div key={b.findingId} className="rounded border border-slate-800 bg-slate-900/40 p-2 text-xs">
                <p className="font-semibold text-slate-100">{b.title}</p>
                <p className="text-slate-400">
                  {b.role || 'unknown'} · {b.confidence}% · {b.source || 'N/A'}
                </p>
                <p className="text-slate-500">
                  {b.budget || 'budget N/A'} · {b.location || 'location N/A'}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-slate-500">{b.nextAction || 'No next action'}</span>
                  <Link to={b.openLink} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800">
                    Open Lead
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action Center</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {snap.actions.available.map(a => (
            <Link key={a.id} to={a.href.startsWith('/api/') ? '/admin/agents/runtime' : a.href} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
              {a.label}
            </Link>
          ))}
          {snap.actions.unavailable.map(a => (
            <span key={a.id} className="rounded border border-slate-800 px-3 py-1.5 text-xs text-slate-500">
              {a.label} (Unavailable{a.reason ? `: ${a.reason}` : ''})
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  href: string;
  tone?: 'warn';
}) {
  return (
    <Link to={href} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 hover:border-slate-600">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${tone === 'warn' ? 'text-amber-300' : 'text-slate-100'}`}>{value}</p>
    </Link>
  );
}

function RuntimeBox({
  name,
  status,
  detail,
  reason,
}: {
  name: string;
  status: RuntimeState;
  detail: string;
  reason: string | null;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-100">{name}</p>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${stateBadge(status)}`}>
          {status.toUpperCase()}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-300">{detail}</p>
      {reason ? <p className="text-[10px] text-slate-500">{reason}</p> : null}
    </div>
  );
}
