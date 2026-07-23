import React, { memo } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { StatusBadge, StatusDot } from './OpsPrimitives';

type Props = {
  healthScore: number;
  fleetOnline: number;
  fleetTotal: number;
  fleetBusy: number;
  lastSnapshot: string | null;
  refreshReason?: string;
  refreshing?: boolean;
  onRefresh: () => void;
};

function healthTone(score: number): 'ok' | 'warn' | 'danger' {
  if (score >= 80) return 'ok';
  if (score >= 50) return 'warn';
  return 'danger';
}

export const OpsCenterHeader = memo(function OpsCenterHeader({
  healthScore,
  fleetOnline,
  fleetTotal,
  fleetBusy,
  lastSnapshot,
  refreshReason,
  refreshing,
  onRefresh,
}: Props) {
  const tone = healthTone(healthScore);
  return (
    <header className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/90 via-slate-950/80 to-slate-950/60 p-4 backdrop-blur-md sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Mission Control
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">
            Automation Operations Center
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Snapshot-based · không poll agent trực tiếp
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2">
            <Activity className="h-3.5 w-3.5 text-rose-400" />
            <div>
              <div className="text-[10px] uppercase text-slate-500">System Health</div>
              <div className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-slate-100">
                <StatusDot tone={tone} />
                {healthScore}/100
              </div>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2">
            <div>
              <div className="text-[10px] uppercase text-slate-500">Fleet Status</div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-100">
                <StatusBadge label={`${fleetOnline}/${fleetTotal} online`} tone="ok" />
                <StatusBadge label={`${fleetBusy} busy`} tone={fleetBusy ? 'busy' : 'neutral'} />
              </div>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2">
            <div>
              <div className="text-[10px] uppercase text-slate-500">Last Snapshot</div>
              <div className="text-xs tabular-nums text-slate-300">
                {lastSnapshot
                  ? new Date(lastSnapshot).toLocaleString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      day: '2-digit',
                      month: '2-digit',
                    })
                  : '—'}
                {refreshReason ? (
                  <span className="ml-1 text-slate-600">· {refreshReason}</span>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
});
