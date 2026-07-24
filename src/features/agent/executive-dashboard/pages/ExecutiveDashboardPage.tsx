import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
} from '../../shared/AgentPlatformUi';

type Snapshot = {
  today: {
    health: number;
    aiStatus: string;
    campaign: string;
    buyer: number;
    qualified: number;
    appointments: number;
    pipelineTy: number;
    expectedRevenueTy: number;
  };
  aiDoing: {
    active: Array<{
      id: string;
      title: string;
      status: string;
      progress: number;
      durationLabel: string;
      machine: string;
    }>;
    waitingApproval: Array<{
      id: string;
      title: string;
      status: string;
      durationLabel: string;
      machine: string;
    }>;
  };
  funnel: {
    scanned: number;
    candidates: number;
    aiReviewed: number;
    qualified: number;
    sales: number;
    appointments: number;
    won: number;
  };
  campaigns: Array<{
    name: string;
    status: string;
    buyers: number;
    roi: string;
    pipelineTy: number;
    content: number;
    publishing: string;
  }>;
  attention: Array<{ severity: string; text: string }>;
  recommendations: string[];
  opsMini: Array<{ label: string; value: string; href: string }>;
};

function sevDot(sev: string) {
  if (sev === 'red') return 'bg-rose-500';
  if (sev === 'yellow') return 'bg-amber-400';
  return 'bg-emerald-400';
}

function taskMark(status: string) {
  if (status === 'done') return '✓';
  if (status === 'running') return '…';
  if (status === 'waiting') return '○';
  return '·';
}

export default function ExecutiveDashboardPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
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
    const t = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(t);
  }, [load]);

  if (loading && !snap) return <AgentPanelLoader label="Đang tải Executive Dashboard..." />;
  if (error && !snap) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!snap) return null;

  const t = snap.today;
  const f = snap.funnel;
  const funnelSteps = [
    ['Scanned', f.scanned],
    ['Candidates', f.candidates],
    ['AI Reviewed', f.aiReviewed],
    ['Qualified', f.qualified],
    ['Sales', f.sales],
    ['Appointments', f.appointments],
    ['Won', f.won],
  ] as const;

  return (
    <div className="space-y-5">
      <AgentPanelHeader
        title="Executive"
        subtitle="AI đang làm gì · khách đâu · kẹt đâu · làm gì tiếp"
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {/* Desktop 3-col / mobile 1-col */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* BLOCK 1 — Today */}
        <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 to-slate-900/80 p-5 lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today</div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500">Health</div>
              <div className="text-2xl font-semibold text-emerald-300">{t.health}%</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">AI Status</div>
              <div className="text-2xl font-semibold text-sky-300">{t.aiStatus}</div>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <div className="text-xs text-slate-500">Campaign</div>
              <div className="truncate text-xl font-semibold text-slate-100">{t.campaign}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['Buyer', t.buyer],
              ['Qualified', t.qualified],
              ['Appointments', t.appointments],
              ['Pipeline', `${t.pipelineTy} tỷ`],
              ['Expected', `${t.expectedRevenueTy} tỷ`],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3">
                <div className="text-[11px] uppercase text-slate-500">{label}</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">{value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* BLOCK 5 — Attention */}
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attention</div>
          <ul className="mt-3 space-y-3">
            {snap.attention.map((a, i) => (
              <li key={`${a.text}-${i}`} className="flex items-start gap-2 text-sm text-slate-200">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sevDot(a.severity)}`} />
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* BLOCK 2 — AI Is Doing */}
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI Is Doing</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {snap.aiDoing.active.map(task => (
              <div
                key={task.id}
                className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-100">
                    <span className="mr-2 text-emerald-300">{taskMark(task.status)}</span>
                    {task.title}
                  </div>
                  <div className="text-[11px] text-slate-500">{task.progress}%</div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-rose-500/70"
                    style={{ width: `${Math.min(100, task.progress)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                  <span>{task.durationLabel}</span>
                  <span>{task.machine}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-500/80">
              Waiting Approval
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {snap.aiDoing.waitingApproval.map(task => (
                <div
                  key={task.id}
                  className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100"
                >
                  {task.title}
                  <span className="ml-2 text-amber-500/70">{task.durationLabel}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BLOCK 6 — Recommendations */}
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            AI Recommendation
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-200">Hôm nay nên:</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {snap.recommendations.map(r => (
              <li key={r} className="flex gap-2">
                <span className="text-rose-300">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* BLOCK 3 — Lead Funnel */}
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Lead Funnel
          </div>
          <div className="mt-4 flex flex-wrap items-stretch gap-2">
            {funnelSteps.map(([label, value], idx) => {
              const prev = idx > 0 ? Number(funnelSteps[idx - 1][1]) : 0;
              const conv =
                idx > 0 && prev > 0 ? `${Math.round((Number(value) / prev) * 100)}%` : null;
              return (
                <React.Fragment key={label}>
                  <div className="min-w-[88px] flex-1 rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
                    <div className="mt-1 text-xl font-semibold text-slate-100">{value}</div>
                    {conv ? (
                      <div className="mt-1 text-[10px] text-slate-500">conv {conv}</div>
                    ) : null}
                  </div>
                  {idx < funnelSteps.length - 1 ? (
                    <div className="hidden items-center text-slate-600 sm:flex">↓</div>
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
        </section>

        {/* BLOCK 4 — Campaign Board */}
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Campaign Board
          </div>
          <div className="mt-3 space-y-3">
            {snap.campaigns.map(c => (
              <div key={c.name} className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-100">{c.name}</div>
                  <div className="text-[11px] uppercase text-slate-500">{c.status}</div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
                  <div>
                    Buyer <span className="text-slate-200">{c.buyers}</span>
                  </div>
                  <div>
                    ROI <span className="text-emerald-300">{c.roi}</span>
                  </div>
                  <div>
                    {c.pipelineTy} tỷ
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Ops mini cards */}
      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Operations · mini
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {snap.opsMini.map(card => (
            <Link
              key={card.label}
              to={card.href}
              className="rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-3 transition hover:border-slate-600"
            >
              <div className="text-[11px] uppercase text-slate-500">{card.label}</div>
              <div className="mt-1 text-sm font-semibold text-slate-300">{card.value}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
