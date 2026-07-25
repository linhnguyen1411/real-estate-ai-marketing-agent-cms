import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData, SnapshotMetric } from '../../../services/api';

type Props = {
  data: DashboardData;
  refreshing?: boolean;
};

function trendClass(dir: string | null | undefined) {
  if (dir === 'up') return 'text-emerald-400';
  if (dir === 'down') return 'text-rose-400';
  return 'text-slate-500';
}

function AnimatedValue({ value }: { value: string }) {
  const numeric = Number(String(value).replace(/[^\d.-]/g, ''));
  const isNum = Number.isFinite(numeric) && /^-?\d+(\.\d+)?/.test(String(value).trim());
  const [shown, setShown] = useState(isNum ? 0 : value);

  useEffect(() => {
    if (!isNum) {
      setShown(value);
      return;
    }
    let frame = 0;
    const frames = 18;
    const timer = window.setInterval(() => {
      frame += 1;
      const t = frame / frames;
      const eased = 1 - Math.pow(1 - t, 3);
      const current = numeric * eased;
      const decimals = String(value).includes('.') ? 1 : 0;
      const suffix = String(value).replace(/^-?[\d.]+/, '');
      setShown(`${current.toFixed(decimals)}${suffix}`);
      if (frame >= frames) {
        window.clearInterval(timer);
        setShown(value);
      }
    }, 16);
    return () => window.clearInterval(timer);
  }, [value, isNum, numeric]);

  return <>{shown}</>;
}

function SnapshotCard({ metric }: { metric: SnapshotMetric }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(metric.href)}
      className="min-h-[132px] rounded-2xl border border-slate-800 bg-slate-900/50 p-3.5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-rose-500/30 hover:bg-slate-900/80"
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {metric.title}
      </div>
      {metric.hasData ? (
        <>
          <div className="mt-2 text-2xl font-extrabold tracking-tight text-white">
            <AnimatedValue value={metric.value} />
          </div>
          <div className="mt-2 space-y-0.5 text-[11px]">
            <div className={trendClass(metric.trendDirection)}>
              {metric.trendVsYesterday ? (
                <>Yesterday {metric.trendVsYesterday}</>
              ) : (
                <span className="text-slate-600">Yesterday No data</span>
              )}
            </div>
            <div className="text-slate-500">
              {metric.trendVs7d ? (
                <>7d {metric.trendVs7d}</>
              ) : (
                <span className="text-slate-600">7d No data</span>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="text-lg font-semibold text-slate-500">No data</div>
          <div className="text-[11px] font-semibold text-rose-300/90">Open module →</div>
        </div>
      )}
    </button>
  );
}

function SkeletonBlock() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-28 rounded-2xl bg-slate-900/80" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-slate-900/70" />
        ))}
      </div>
    </div>
  );
}

export default function ExecutiveKpiGrid({ data, refreshing }: Props) {
  const navigate = useNavigate();
  const ready = data?.version === 'h052_executive_command' && Array.isArray(data.snapshot);
  const hero = data.hero;
  const snapshot = data.snapshot || [];

  if (!ready) return <SkeletonBlock />;

  const sevDot = (s: string) =>
    s === 'critical' ? 'bg-rose-500' : s === 'warning' ? 'bg-amber-400' : 'bg-emerald-400';
  const sevIcon = (s: string) => (s === 'critical' ? '🔴' : s === 'warning' ? '🟡' : '🟢');

  return (
    <div className="space-y-5 transition-opacity duration-300">
      {/* Header + realtime */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Executive Command Center</h2>
          <p className="text-sm text-slate-400">AI Sales Employee — business view for CEO</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live · 30s
          </span>
          <span className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 font-mono text-[11px] text-slate-400">
            {refreshing ? 'Refreshing…' : new Date(data.generatedAt).toLocaleString('vi-VN')}
          </span>
        </div>
      </div>

      {/* 11. Executive Summary */}
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 to-slate-900/70 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Executive Summary
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-200">{data.summary}</p>
      </section>

      {/* 1. Today Hero */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-white">🤖 AI Sales Employee</div>
            <div
              className={`mt-1 text-sm font-semibold ${
                hero.aiStatus === 'Working'
                  ? 'text-emerald-300'
                  : hero.aiStatus === 'Offline'
                    ? 'text-slate-400'
                    : 'text-amber-300'
              }`}
            >
              {hero.aiStatusLabel}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase text-slate-500">Business Health</div>
            <div className="text-2xl font-extrabold text-emerald-300">
              {hero.businessHealth != null ? (
                <>
                  <AnimatedValue value={String(hero.businessHealth)} />%
                </>
              ) : (
                'No data'
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
            <div className="text-[11px] text-slate-500">Today&apos;s Goal</div>
            {hero.todayGoal ? (
              <div className="mt-1 text-lg font-semibold text-slate-100">
                {hero.todayGoal.label}{' '}
                <span className="text-rose-300">
                  {hero.todayGoal.current} / {hero.todayGoal.target}
                </span>
              </div>
            ) : (
              <div className="mt-1 text-slate-500">No data</div>
            )}
          </div>
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
            <div className="text-[11px] text-slate-500">Campaign</div>
            <div className="mt-1 truncate text-lg font-semibold text-slate-100">
              {hero.currentCampaign || 'No data'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
            <div className="text-[11px] text-slate-500">Expected Revenue</div>
            <div className="mt-1 text-lg font-semibold text-slate-100">
              {hero.expectedRevenueTy != null ? `${hero.expectedRevenueTy} tỷ` : 'No data'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
            <div className="text-[11px] text-slate-500">Confidence</div>
            <div className="mt-1 text-lg font-semibold text-sky-300">
              {hero.confidence != null ? `${hero.confidence}%` : 'No data'}
            </div>
          </div>
        </div>
      </section>

      {/* 7. Quick Actions */}
      <section className="flex flex-wrap gap-2">
        {(data.quickActions || []).map(a => (
          <button
            key={a.label}
            type="button"
            onClick={() => navigate(a.href)}
            className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
          >
            {a.label}
          </button>
        ))}
      </section>

      {/* 2+3 Business Snapshot + trends */}
      <section>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Business Snapshot
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {snapshot.map(m => (
            <SnapshotCard key={m.id} metric={m} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 4. AI Insight */}
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 lg:col-span-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            AI Insight
          </div>
          <ul className="mt-3 space-y-2.5 text-sm text-slate-300">
            {(data.insights || []).map(line => (
              <li key={line} className="flex gap-2">
                <span className="text-sky-400">◆</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 5. Recommendations as Actions */}
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 lg:col-span-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            AI Recommendation
          </div>
          <div className="mt-3 space-y-2">
            {(data.recommendations || []).map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(r.href)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2.5 text-left transition hover:border-rose-500/30"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{r.action}</div>
                  <div className="text-xs text-slate-400">{r.detail}</div>
                </div>
                <span className="text-[11px] font-semibold text-rose-300">Open →</span>
              </button>
            ))}
          </div>
        </section>

        {/* 6. Attention Center */}
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 lg:col-span-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Attention Center
          </div>
          <ul className="mt-3 space-y-3">
            {(data.attention || []).map((a, i) => (
              <li key={`${a.text}-${i}`}>
                <button
                  type="button"
                  onClick={() => navigate(a.href)}
                  className="flex w-full items-start gap-2 text-left text-sm text-slate-200 transition hover:text-white"
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sevDot(a.severity)}`} />
                  <span>
                    <span className="mr-1" aria-hidden>
                      {sevIcon(a.severity)}
                    </span>
                    {a.text}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
