/**
 * Telegram formatters for Execution Agent telemetry (single place — DRY).
 */

import type { ExecutionAgentRuntimeSnapshot } from './types';

export function formatAgentTelemetryLines(snap: ExecutionAgentRuntimeSnapshot): string[] {
  const lines = [
    `Agent ${snap.agentId}`,
    `host=${snap.hostname} · ${snap.platform} · v${snap.version}`,
    `status=${snap.status || '—'} · heartbeat=${snap.heartbeatAt}`,
    `uptime=${snap.uptimeSec ?? '—'}s · rss=${snap.process.rssMb ?? '—'}MB · heap=${snap.process.heapUsedMb ?? '—'}MB`,
    `cpuLoad1m=${snap.host.loadAvg1m ?? '—'} · memFree=${snap.host.memFreeMb ?? '—'}/${snap.host.memTotalMb ?? '—'}MB`,
    `chrome=${snap.chromeCount} · slots=${snap.executionSlots.length} · jobs run=${snap.jobs.running} wait=${snap.jobs.waiting}`,
  ];
  if (snap.currentUrl) lines.push(`url=${snap.currentUrl}`);
  if (snap.mission?.missionName) {
    lines.push(
      `mission=${snap.mission.missionName} step=${snap.mission.currentStep || '—'} findings=${snap.mission.findingCount ?? '—'}`,
    );
  }
  if (snap.scanner?.currentSource || snap.scanner?.currentGroup) {
    lines.push(
      `scan source=${snap.scanner.currentSource || snap.scanner.currentGroup || '—'} posts=${snap.scanner.postsScanned ?? '—'} findings=${snap.scanner.findings ?? '—'}`,
    );
  }
  if (snap.publish?.destination || snap.publish?.phase) {
    lines.push(
      `publish ${snap.publish.phase || '—'} → ${snap.publish.destination || '—'} retries=${snap.publish.retryCount ?? 0}`,
    );
  }
  return lines;
}

export function formatBrowserTelemetryLines(snap: ExecutionAgentRuntimeSnapshot): string[] {
  const lines = [`Browser profiles · agent=${snap.agentId} · chrome=${snap.chromeCount}`];
  if (snap.browserProfiles.length === 0) {
    lines.push('(no profiles in last snapshot)');
    return lines;
  }
  for (const p of snap.browserProfiles.slice(0, 10)) {
    lines.push(
      `• ${p.profile} [${p.state}] busy=${p.busy ? 'yes' : 'no'} lockedBy=${p.lockedBy || '—'} url=${(p.currentUrl || '—').slice(0, 60)}`,
    );
  }
  return lines;
}
