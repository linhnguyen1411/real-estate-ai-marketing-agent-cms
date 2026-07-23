import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Unlock,
  Monitor,
} from 'lucide-react';
import type { OpsAlert, TimelineItem } from '../utils/deriveAlerts';
import { EmptyHint, GlassPanel, StatusBadge, StatusDot } from './OpsPrimitives';
import { formatAgentDate } from '../../shared/AgentPlatformUi';

export const ActivityTimeline = memo(function ActivityTimeline({
  items,
}: {
  items: TimelineItem[];
}) {
  return (
    <GlassPanel title="Activity Timeline" subtitle="Realtime from Runtime Snapshot events">
      {items.length === 0 ? (
        <EmptyHint>Chưa có sự kiện trong snapshot.</EmptyHint>
      ) : (
        <ol className="relative space-y-0 border-l border-slate-800 pl-4">
          {items.slice(0, 30).map(item => {
            const danger = /FAIL|CRASH|OFFLINE/i.test(item.type);
            const ok = /COMPLETED|FINISHED|ONLINE|RELEASED/i.test(item.type);
            return (
              <li key={item.id} className="relative pb-3 last:pb-0">
                <span
                  className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border border-slate-950 ${
                    danger ? 'bg-rose-400' : ok ? 'bg-emerald-400' : 'bg-sky-400'
                  }`}
                />
                <div className="text-[11px] font-semibold text-slate-200">{item.label}</div>
                <div className="text-[10px] tabular-nums text-slate-500">
                  {formatAgentDate(item.at)}
                  {item.agentId ? ` · ${item.agentId.slice(0, 12)}` : ''}
                </div>
                {item.detail && (
                  <div className="mt-0.5 truncate text-[10px] text-slate-600">{item.detail}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </GlassPanel>
  );
});

export const AlertsPanel = memo(function AlertsPanel({ alerts }: { alerts: OpsAlert[] }) {
  const errors = alerts.filter(a => a.severity === 'error');
  const warnings = alerts.filter(a => a.severity === 'warning');

  return (
    <GlassPanel
      title="Alerts"
      subtitle="Warnings · Errors · Retries · Memory · Offline"
      actions={
        <div className="flex gap-1">
          <StatusBadge label={`${errors.length} err`} tone={errors.length ? 'danger' : 'neutral'} />
          <StatusBadge
            label={`${warnings.length} warn`}
            tone={warnings.length ? 'warn' : 'neutral'}
          />
        </div>
      }
    >
      {alerts.length === 0 ? (
        <EmptyHint>Không có cảnh báo — hệ thống ổn định.</EmptyHint>
      ) : (
        <ul className="space-y-1.5">
          {alerts.slice(0, 20).map(a => (
            <li
              key={a.id}
              className={`flex gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                a.severity === 'error'
                  ? 'border-rose-500/20 bg-rose-950/20 text-rose-100'
                  : 'border-amber-500/20 bg-amber-950/15 text-amber-100'
              }`}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                  <StatusDot tone={a.severity === 'error' ? 'danger' : 'warn'} />
                  {a.title}
                  <StatusBadge label={a.category} tone="neutral" />
                </div>
                {a.detail && <div className="mt-0.5 truncate text-[10px] opacity-70">{a.detail}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
});

export const QuickActions = memo(function QuickActions({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const navigate = useNavigate();
  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-slate-900/60 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-sky-500/30 hover:bg-slate-800';

  return (
    <GlassPanel title="Quick Actions" subtitle="Navigate · refresh snapshot">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button type="button" className={btn} onClick={() => navigate('/admin/agents/jobs')}>
          <RotateCcw className="h-3.5 w-3.5" />
          Retry / Jobs
        </button>
        <button type="button" className={btn} onClick={() => navigate('/admin/agents/sessions')}>
          <Unlock className="h-3.5 w-3.5" />
          Release Browser
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => navigate('/admin/agents/notifications')}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open Logs
        </button>
        <button type="button" className={btn} onClick={() => navigate('/admin/agents/sessions')}>
          <Monitor className="h-3.5 w-3.5" />
          View Agent
        </button>
      </div>
    </GlassPanel>
  );
});
