import React, { memo, useMemo, useState } from 'react';
import type { OperationsMetricsSnapshot } from '../../../../types/agentPlatform';
import {
  EmptyHint,
  GlassPanel,
  ProgressBar,
  StatusBadge,
  StatusDot,
  activityTone,
  formatNum,
  formatShortAge,
} from './OpsPrimitives';

type Machine = OperationsMetricsSnapshot['machines'][number];

function ramLabel(m: Machine): string {
  if (m.memFreeMb != null && m.memTotalMb != null) {
    const used = m.memTotalMb - m.memFreeMb;
    const pct = m.memTotalMb > 0 ? Math.round((used / m.memTotalMb) * 100) : 0;
    return `${pct}% · ${m.memFreeMb}/${m.memTotalMb}MB`;
  }
  if (m.rssMb != null) return `RSS ${m.rssMb}MB`;
  return '—';
}

function jobProgress(m: Machine): number {
  const total = m.assigned || m.running + m.waiting + m.completed;
  if (!total) return m.activity === 'idle' ? 100 : 0;
  return Math.round((m.completed / total) * 100);
}

export const FleetAgentCard = memo(function FleetAgentCard({ machine }: { machine: Machine }) {
  const tone = activityTone(machine.activity);
  const online = machine.status === 'online' || machine.status === 'degraded';
  const slotsBusy = machine.running;
  const slotsTotal = Math.max(1, machine.executionSlots || 1);

  return (
    <article className="rounded-xl border border-white/5 bg-slate-900/40 p-3 transition hover:border-sky-500/20">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot tone={online ? (tone === 'offline' ? 'offline' : tone) : 'offline'} />
            <h4 className="truncate text-sm font-semibold text-slate-100">
              {machine.displayName || machine.hostname}
            </h4>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {machine.hostname} · {machine.machineId}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge label={online ? 'Online' : 'Offline'} tone={online ? 'ok' : 'offline'} />
          <StatusBadge label={machine.activity} tone={tone} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-slate-950/50 px-2 py-1.5">
          <div className="text-slate-500">CPU</div>
          <div className="font-semibold tabular-nums text-slate-200">{formatNum(machine.cpuLoad1m)}</div>
        </div>
        <div className="rounded-lg bg-slate-950/50 px-2 py-1.5">
          <div className="text-slate-500">RAM</div>
          <div className="font-semibold tabular-nums text-slate-200">{ramLabel(machine)}</div>
        </div>
        <div className="rounded-lg bg-slate-950/50 px-2 py-1.5">
          <div className="text-slate-500">Slots</div>
          <div className="font-semibold tabular-nums text-slate-200">
            {slotsBusy}/{slotsTotal}
          </div>
        </div>
        <div className="rounded-lg bg-slate-950/50 px-2 py-1.5">
          <div className="text-slate-500">Browser</div>
          <div className="font-semibold tabular-nums text-slate-200">
            {machine.browserBusy} busy · {machine.browserIdle} idle
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-[11px] text-slate-400">
        <div>
          <span className="text-slate-500">Job · </span>
          run {machine.running} / wait {machine.waiting} / done {machine.completed}
        </div>
        <div className="truncate">
          <span className="text-slate-500">Mission · </span>
          {machine.missionName || '—'}
        </div>
        <div className="truncate">
          <span className="text-slate-500">Action · </span>
          {machine.currentStep || machine.activity}
        </div>
        <div>
          <span className="text-slate-500">Heartbeat · </span>
          {formatShortAge(machine.heartbeatAgeMs)} ago
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar
          value={jobProgress(machine)}
          tone={tone === 'danger' ? 'rose' : tone === 'busy' ? 'sky' : 'emerald'}
          label="Progress"
        />
      </div>
    </article>
  );
});

const VIRTUAL_THRESHOLD = 24;
const PAGE_SIZE = 12;

export const FleetPanel = memo(function FleetPanel({
  machines,
  embedded = false,
}: {
  machines: Machine[];
  embedded?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(
    () =>
      [...machines].sort((a, b) => {
        const rank = (x: Machine) =>
          x.activity === 'error' ? 0 : x.activity === 'offline' ? 3 : x.activity === 'idle' ? 2 : 1;
        return rank(a) - rank(b);
      }),
    [machines],
  );

  const visible =
    !showAll && sorted.length > VIRTUAL_THRESHOLD
      ? sorted.slice(0, PAGE_SIZE)
      : showAll
        ? sorted
        : sorted.slice(0, Math.max(PAGE_SIZE, Math.min(sorted.length, VIRTUAL_THRESHOLD)));

  const body =
    machines.length === 0 ? (
      <EmptyHint>Chưa có agent đăng ký. Chờ heartbeat / Runtime Snapshot.</EmptyHint>
    ) : (
      <>
        <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-1">
          {visible.map(m => (
            <FleetAgentCard key={m.agentId} machine={m} />
          ))}
        </div>
        {sorted.length > visible.length && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            Show all {sorted.length} agents
          </button>
        )}
        {showAll && sorted.length > PAGE_SIZE && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="mt-2 w-full text-xs text-slate-500 hover:text-slate-300"
          >
            Collapse
          </button>
        )}
      </>
    );

  if (embedded) return <div className="space-y-3">{body}</div>;

  return (
    <GlassPanel
      title="Fleet"
      subtitle={`${machines.length} workstation${machines.length === 1 ? '' : 's'} · 1 card / machine`}
      actions={
        <StatusBadge
          label={`${machines.filter(m => m.status === 'online').length} online`}
          tone="ok"
        />
      }
    >
      {body}
    </GlassPanel>
  );
});
