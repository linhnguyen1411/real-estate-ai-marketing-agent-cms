/**
 * Telegram formatters for Fleet Dashboard (DRY — single place).
 */

import type { FleetAgent, FleetBrowserRow, FleetJobOwnership, FleetState } from './types';

export function formatFleetDashboardLines(state: FleetState): string[] {
  const lines = [
    '══ Fleet ══',
    `machines=${state.total} · online=${state.online} · offline=${state.offline} · health=${state.healthScore}`,
    `busy=${state.busy} idle=${state.idle} scan=${state.scanning} publish=${state.publishing} campaign=${state.campaign}`,
    `jobs=${state.runningJobs} missions=${state.runningMissions} browsers=${state.runningBrowsers}`,
  ];
  if (state.agents.length === 0) {
    lines.push('(no registered agents)');
    return lines;
  }
  lines.push('Machines:');
  for (const a of state.agents.slice(0, 12)) {
    lines.push(formatFleetAgentBrief(a));
  }
  return lines;
}

export function formatFleetAgentBrief(a: FleetAgent): string {
  const cpu = a.cpuLoad1m != null ? `cpu=${a.cpuLoad1m}` : 'cpu=—';
  const ram =
    a.memFreeMb != null && a.memTotalMb != null
      ? `ram=${a.memFreeMb}/${a.memTotalMb}MB`
      : a.rssMb != null
        ? `rss=${a.rssMb}MB`
        : 'ram=—';
  const hb =
    a.heartbeatAgeMs != null ? `${Math.round(a.heartbeatAgeMs / 1000)}s` : '—';
  const mission = a.mission?.missionName ? ` m=${a.mission.missionName}` : '';
  return `• ${a.hostname} [${a.status}/${a.activity}] ${cpu} ${ram} jobs=${a.jobs.running}/${a.jobs.waiting} chrome=${a.chromeCount} hb=${hb}${mission}`;
}

export function formatFleetAgentDetailLines(a: FleetAgent): string[] {
  const lines = [
    `Agent ${a.displayName}`,
    `id=${a.agentId} · machine=${a.machineId}`,
    `host=${a.hostname} · ${a.platform} · v${a.version}`,
    `status=${a.status} · activity=${a.activity}`,
    `heartbeat=${a.lastHeartbeat || '—'} (age=${a.heartbeatAgeMs != null ? Math.round(a.heartbeatAgeMs / 1000) + 's' : '—'})`,
    `uptime=${a.uptimeSec ?? '—'}s · rss=${a.rssMb ?? '—'}MB · heap=${a.heapUsedMb ?? '—'}MB`,
    `cpuLoad1m=${a.cpuLoad1m ?? '—'} · mem=${a.memFreeMb ?? '—'}/${a.memTotalMb ?? '—'}MB`,
    `caps=${a.capabilities.join(',') || '—'} · tags=${a.tags.join(',') || '—'}`,
    `jobs run=${a.jobs.running} wait=${a.jobs.waiting} step=${a.jobs.currentStep || '—'}`,
    `chrome=${a.chromeCount} · slots=${a.executionSlots}`,
  ];
  if (a.currentUrl) lines.push(`url=${a.currentUrl}`);
  if (a.mission?.missionName) {
    lines.push(
      `mission=${a.mission.missionName} type=${a.mission.missionType || '—'} step=${a.mission.currentStep || '—'} findings=${a.mission.findingCount ?? '—'}`,
    );
  }
  if (a.scanner?.currentSource || a.scanner?.currentGroup) {
    lines.push(
      `scan source=${a.scanner.currentSource || a.scanner.currentGroup || '—'} posts=${a.scanner.postsScanned ?? '—'} findings=${a.scanner.findings ?? '—'}`,
    );
  }
  if (a.publish?.phase || a.publish?.destination) {
    lines.push(
      `publish ${a.publish.phase || '—'} → ${a.publish.destination || '—'} retries=${a.publish.retryCount ?? 0}`,
    );
  }
  const browsers = a.browserProfiles.slice(0, 5);
  if (browsers.length) {
    lines.push('Browsers:');
    for (const p of browsers) {
      lines.push(
        `  • ${p.profile} [${p.state}] busy=${p.busy ? 'yes' : 'no'} lockedBy=${p.lockedBy || '—'}`,
      );
    }
  }
  if (a.lastError) lines.push(`error=${a.lastError.slice(0, 120)}`);
  return lines;
}

export function formatFleetBrowserLines(rows: FleetBrowserRow[]): string[] {
  const lines = [`Fleet browsers (${rows.length})`];
  if (rows.length === 0) {
    lines.push('(none — waiting for agent heartbeat snapshots)');
    return lines;
  }
  for (const r of rows.slice(0, 15)) {
    const name = r.profile.split(/[/\\]/).pop() || r.profile;
    const locked =
      r.runningSec != null
        ? r.runningSec < 60
          ? `${r.runningSec}s`
          : `${Math.floor(r.runningSec / 60)}m${String(r.runningSec % 60).padStart(2, '0')}s`
        : r.busy
          ? 'yes'
          : 'idle';
    const hb = r.lastHeartbeat
      ? `${Math.max(0, Math.round((Date.now() - Date.parse(r.lastHeartbeat)) / 1000))}s`
      : '—';
    lines.push(`── ${name}`);
    lines.push(`Owner · ${r.hostname}`);
    if (r.missionRunId) lines.push(`Mission · ${r.missionRunId}`);
    if (r.lockedBy) lines.push(`Job · ${r.lockedBy}`);
    lines.push(`State · ${r.state} · Locked ${locked} · Heartbeat ${hb}`);
    if (r.leaseRemainingSec != null) lines.push(`Lease TTL · ${r.leaseRemainingSec}s`);
  }
  return lines;
}

export function formatFleetJobOwnershipLines(jobs: FleetJobOwnership[]): string[] {
  const lines = [`Fleet jobs (${jobs.length})`];
  if (jobs.length === 0) {
    lines.push('(empty)');
    return lines;
  }
  for (const j of jobs.slice(0, 12)) {
    const dur =
      j.durationMs != null
        ? j.durationMs < 1000
          ? `${j.durationMs}ms`
          : `${Math.round(j.durationMs / 1000)}s`
        : '—';
    lines.push(
      `• ${j.jobId.slice(0, 10)} ${j.type} [${j.status}] by=${j.claimedBy || '—'} host=${j.hostname || '—'} t=${dur}`,
    );
  }
  return lines;
}
