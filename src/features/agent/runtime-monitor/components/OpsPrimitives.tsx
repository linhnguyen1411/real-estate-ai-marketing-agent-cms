/**
 * Shared presentation primitives for Operations Center (UI only).
 */
import React, { memo } from 'react';

export function GlassPanel({
  title,
  subtitle,
  children,
  className = '',
  actions,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/5 bg-slate-950/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md ${className}`}
    >
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h3>
            )}
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'ok' | 'busy' | 'warn' | 'danger' | 'offline';
}) {
  const cls = {
    neutral: 'border-slate-700 bg-slate-800/80 text-slate-300',
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    busy: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    danger: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    offline: 'border-slate-600 bg-slate-900 text-slate-500',
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

export function StatusDot({
  tone = 'neutral',
}: {
  tone?: 'neutral' | 'ok' | 'busy' | 'warn' | 'danger' | 'offline';
}) {
  const cls = {
    neutral: 'bg-slate-500',
    ok: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]',
    busy: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.45)]',
    warn: 'bg-amber-400',
    danger: 'bg-rose-400',
    offline: 'bg-slate-600',
  }[tone];
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} aria-hidden />;
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'sky',
  label,
}: {
  value: number;
  max?: number;
  tone?: 'sky' | 'emerald' | 'amber' | 'rose';
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bar = {
    sky: 'bg-sky-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  }[tone];
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function MetricChip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/50 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100">{value}</div>
    </div>
  );
}

export function SkeletonBlock({ className = 'h-20' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-white/5 bg-slate-900/40 ${className}`}
      aria-hidden
    />
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-3 py-4 text-center text-xs text-slate-500">
      {children}
    </p>
  );
}

export function Accordion({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-white/5 bg-slate-950/60 backdrop-blur-md open:pb-3"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-100 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span className="text-slate-500 transition group-open:rotate-90">▸</span>
          {title}
        </span>
        {badge}
      </summary>
      <div className="space-y-3 px-4">{children}</div>
    </details>
  );
}

export function activityTone(
  activity: string,
): 'neutral' | 'ok' | 'busy' | 'warn' | 'danger' | 'offline' {
  const a = activity.toLowerCase();
  if (a === 'idle') return 'ok';
  if (a === 'offline') return 'offline';
  if (a === 'error') return 'danger';
  if (['busy', 'scanning', 'publishing', 'campaign', 'browser_hold'].includes(a)) return 'busy';
  return 'neutral';
}

export function formatShortAge(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export function formatNum(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(digits);
}

export const MemoGlassPanel = memo(GlassPanel);
