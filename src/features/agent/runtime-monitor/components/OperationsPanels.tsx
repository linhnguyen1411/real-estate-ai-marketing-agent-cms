import React, { memo } from 'react';
import type {
  AutomationRuntimeSnapshot,
  OperationsMetricsSnapshot,
} from '../../../../types/agentPlatform';
import {
  EmptyHint,
  GlassPanel,
  MetricChip,
  ProgressBar,
  StatusBadge,
} from './OpsPrimitives';

export const ScannerPanel = memo(function ScannerPanel({
  scanner,
  machines,
}: {
  scanner: OperationsMetricsSnapshot['scanner'];
  machines: OperationsMetricsSnapshot['machines'];
}) {
  const scanning = machines.filter(
    m =>
      m.activity === 'scanning' ||
      ((m.running || 0) > 0 &&
        String(m.currentStep || '')
          .toLowerCase()
          .includes('scan')),
  );
  const progress =
    scanner.sources > 0
      ? Math.round((scanner.completed / Math.max(scanner.sources, scanner.assigned || 1)) * 100)
      : 0;
  const eta =
    scanner.running > 0 && scanner.completed > 0
      ? `~${Math.max(1, Math.ceil((scanner.assigned - scanner.completed) / Math.max(1, scanner.running)))} batches`
      : scanner.running > 0
        ? 'in progress'
        : '—';

  return (
    <GlassPanel title="Scanner" subtitle="Sources · progress · machines">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <MetricChip label="Sources" value={scanner.sources} />
        <MetricChip label="Running" value={scanner.running} />
        <MetricChip label="Completed" value={scanner.completed} />
        <MetricChip label="Posts" value={scanner.postsScanned} />
        <MetricChip label="Findings" value={scanner.findingsToday} />
      </div>
      <div className="mt-3 space-y-2">
        <ProgressBar value={progress} tone="sky" label="Scan progress" />
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <StatusBadge label={`Assigned ${scanner.assigned}`} tone="busy" />
          <span>ETA · {eta}</span>
        </div>
      </div>
      <div className="mt-3">
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-500">
          Current sources / machines
        </p>
        {scanning.length === 0 ? (
          <EmptyHint>Không có máy đang scan.</EmptyHint>
        ) : (
          <ul className="space-y-1.5">
            {scanning.map(m => (
              <li
                key={m.agentId}
                className="rounded-lg border border-white/5 bg-slate-900/40 px-2.5 py-2 text-xs text-slate-300"
              >
                <div className="font-semibold text-slate-100">{m.displayName || m.hostname}</div>
                <div className="mt-0.5 truncate text-slate-500">
                  {m.currentStep || 'scanning'} · jobs {m.running}/{m.waiting}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GlassPanel>
  );
});

export const PublisherPanel = memo(function PublisherPanel({
  publisher,
  machines,
  campaigns,
}: {
  publisher: OperationsMetricsSnapshot['publisher'];
  machines: OperationsMetricsSnapshot['machines'];
  campaigns: AutomationRuntimeSnapshot['campaigns'];
}) {
  const publishingMachines = machines.filter(m => m.activity === 'publishing');
  const activeCampaign = campaigns?.[0];
  const progress = activeCampaign?.progress?.total
    ? Math.round(
        ((activeCampaign.progress.completed + activeCampaign.progress.failed) /
          activeCampaign.progress.total) *
          100,
      )
    : publisher.publishing > 0
      ? 40
      : publisher.publishedToday > 0
        ? 100
        : 0;

  return (
    <GlassPanel title="Publisher" subtitle="Queue · destination · machine">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <MetricChip label="Draft" value={publisher.draft} />
        <MetricChip label="Queue" value={publisher.queue} />
        <MetricChip label="Publishing" value={publisher.publishing} />
        <MetricChip label="Published Today" value={publisher.publishedToday} />
        <MetricChip label="Retry" value={publisher.retry} />
      </div>
      <div className="mt-3 space-y-2 text-xs text-slate-400">
        <ProgressBar value={progress} tone="emerald" label="Publish progress" />
        <div>
          <span className="text-slate-500">Current draft / campaign · </span>
          {activeCampaign ? activeCampaign.id.slice(0, 12) : publishingMachines[0]?.currentStep || '—'}
        </div>
        <div>
          <span className="text-slate-500">Destination · </span>
          {activeCampaign ? 'campaign targets' : 'social queue'}
        </div>
        <div>
          <span className="text-slate-500">Step · </span>
          {publishingMachines[0]?.currentStep ||
            (publisher.publishing > 0 ? 'publishing' : 'idle')}
        </div>
        <div>
          <span className="text-slate-500">Machine · </span>
          {publishingMachines.map(m => m.hostname).join(', ') || '—'}
        </div>
      </div>
    </GlassPanel>
  );
});

export const MissionPanel = memo(function MissionPanel({
  mission,
  timeline,
  machines,
}: {
  mission: OperationsMetricsSnapshot['mission'];
  timeline: AutomationRuntimeSnapshot['missionTimeline'];
  machines: OperationsMetricsSnapshot['machines'];
}) {
  const running = (timeline || []).filter(m =>
    ['running', 'claimed', 'queued'].includes(m.status),
  );
  const machineByHint = (id: string) =>
    machines.find(m => m.missionName && id.includes(m.missionName.slice(0, 6)));

  return (
    <GlassPanel title="Mission" subtitle="Running missions · duration · machine">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricChip label="Running" value={mission.running} />
        <MetricChip label="Waiting" value={mission.waiting} />
        <MetricChip label="Completed" value={mission.completed} />
        <MetricChip label="Failed" value={mission.failed} />
      </div>
      <div className="mt-3">
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-500">
          Running list
        </p>
        {running.length === 0 && machines.filter(m => m.missionName).length === 0 ? (
          <EmptyHint>Không có mission đang chạy.</EmptyHint>
        ) : (
          <ul className="space-y-1.5">
            {running.slice(0, 8).map(m => {
              const started = m.startedAt ? +new Date(m.startedAt) : null;
              const duration =
                started != null ? Math.round((Date.now() - started) / 1000) : null;
              const host = machineByHint(m.missionId)?.hostname;
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-white/5 bg-slate-900/40 px-2.5 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100">{m.id.slice(0, 10)}</span>
                    <StatusBadge label={m.status} tone="busy" />
                  </div>
                  <div className="mt-1 text-slate-500">
                    Machine · {host || '—'} · Duration ·{' '}
                    {duration != null ? `${duration}s` : '—'}
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar
                      value={m.status === 'running' ? 55 : 20}
                      tone={m.status === 'failed' ? 'rose' : 'sky'}
                    />
                  </div>
                </li>
              );
            })}
            {running.length === 0 &&
              machines
                .filter(m => m.missionName)
                .map(m => (
                  <li
                    key={m.agentId}
                    className="rounded-lg border border-white/5 bg-slate-900/40 px-2.5 py-2 text-xs"
                  >
                    <div className="font-semibold text-slate-100">{m.missionName}</div>
                    <div className="mt-1 text-slate-500">
                      Machine · {m.hostname} · Step · {m.currentStep || '—'}
                    </div>
                  </li>
                ))}
          </ul>
        )}
      </div>
    </GlassPanel>
  );
});

export const BrowserPanel = memo(function BrowserPanel({
  browsers,
  fleetBrowserBusy,
  fleetBrowserIdle,
}: {
  browsers: Array<Record<string, unknown>>;
  fleetBrowserBusy: number;
  fleetBrowserIdle: number;
}) {
  return (
    <GlassPanel
      title="Browser Pool"
      subtitle="Owner · Lease · TTL · Mission"
      actions={
        <div className="flex gap-1">
          <StatusBadge label={`${fleetBrowserBusy} busy`} tone="busy" />
          <StatusBadge label={`${fleetBrowserIdle} idle`} tone="ok" />
        </div>
      }
    >
      {browsers.length === 0 ? (
        <EmptyHint>Chưa có browser profile trong snapshot.</EmptyHint>
      ) : (
        <ul className="space-y-1.5">
          {browsers.slice(0, 16).map((b, i) => {
            const state = String(b.state || '');
            const busy =
              state === 'leased' ||
              state === 'active' ||
              state === 'leasing' ||
              Boolean(b.ownerJob) ||
              Boolean(b.jobId);
            const owner =
              b.machineId || b.agentId || b.workerId || b.hostname || '—';
            const job = b.ownerJob || b.jobId || b.lockedBy || '—';
            const mission = b.ownerMission || b.missionRunId || b.currentMission || '—';
            const ttl =
              b.leaseRemainingSec != null ? `${b.leaseRemainingSec}s` : '—';
            const hb =
              b.lastHeartbeat || b.heartbeatAt
                ? String(b.lastHeartbeat || b.heartbeatAt).slice(11, 19)
                : '—';
            const age =
              b.leaseAgeSec != null || b.runningSec != null
                ? `${b.leaseAgeSec ?? b.runningSec}s`
                : '—';
            return (
              <li
                key={String(b.browserId || i)}
                className="rounded-lg border border-white/5 bg-slate-900/40 px-2.5 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-100">
                    {String(b.browserId || b.purpose || 'browser')}
                  </span>
                  <StatusBadge
                    label={busy ? String(state || 'Busy') : 'Idle'}
                    tone={busy ? 'busy' : 'ok'}
                  />
                </div>
                <div className="mt-1 space-y-0.5 text-slate-500">
                  <div>Owner · {String(owner).slice(0, 40)}</div>
                  <div>Job · {String(job).slice(0, 28)} · Mission · {String(mission).slice(0, 24)}</div>
                  <div>
                    Lease · {age} · TTL · {ttl} · HB · {hb}
                  </div>
                  <div className="truncate">
                    URL · {b.currentUrl ? String(b.currentUrl).slice(0, 64) : '—'}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
});
