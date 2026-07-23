import React from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';

export function AgentPanelLoader({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-slate-400">
      <Loader2 className="h-8 w-8 animate-spin text-rose-400" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function AgentPanelError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-6 text-center">
      <AlertCircle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
      <p className="text-sm text-rose-200">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Thử lại
        </button>
      )}
    </div>
  );
}

export function AgentPanelEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/20 p-8 text-center">
      <Inbox className="mx-auto mb-3 h-10 w-10 text-slate-600" />
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      {description && <p className="mt-2 text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function AgentPanelHeader({
  title,
  subtitle,
  onRefresh,
  refreshing,
  actions,
}: {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}

export function AgentStatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    default: 'border-slate-800 bg-slate-900/40 text-white',
    success: 'border-emerald-900/50 bg-emerald-950/20 text-emerald-300',
    warning: 'border-amber-900/50 bg-amber-950/20 text-amber-300',
    danger: 'border-rose-900/50 bg-rose-950/20 text-rose-300',
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  );
}

export function formatAgentDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export const AGENT_SOURCE_TYPE_OPTIONS = [
  { value: 'facebook_group', label: 'Facebook Group / Feed' },
  { value: 'website', label: 'Website' },
  { value: 'forum', label: 'Forum' },
  { value: 'search', label: 'Search' },
] as const;

export const JOB_STATUS_COLORS: Record<string, string> = {
  queued: 'bg-slate-700 text-slate-200',
  claimed: 'bg-indigo-900/50 text-indigo-300',
  running: 'bg-sky-900/50 text-sky-300',
  completed: 'bg-emerald-900/50 text-emerald-300',
  failed: 'bg-rose-900/50 text-rose-300',
  cancelled: 'bg-slate-800 text-slate-500',
};
