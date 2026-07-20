/**
 * Telegram / text adapters for Operations Center metrics.
 */

import type { OperationsMetricsSnapshot } from './types';

function n(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

export function formatOperationsDashboardLines(m: OperationsMetricsSnapshot): string[] {
  const f = m.fleet;
  const s = m.scanner;
  const p = m.publisher;
  const mi = m.mission;
  return [
    '══ Operations Center ══',
    `Fleet · ${f.machinesOnline} online · busy ${f.machinesBusy} · idle ${f.machinesIdle}`,
    `CPU avg ${n(f.cpuAvg)} · RAM used ${n(f.ramUsedPctAvg)}% · health ${f.healthScore}`,
    `Browser busy ${f.browserBusy} · idle ${f.browserIdle}`,
    '',
    `Scanner · sources ${s.sources} · assigned ${s.assigned} · running ${s.running} · done ${s.completed}`,
    `Findings today ${s.findingsToday} · posts ${s.postsScanned}`,
    '',
    `Publisher · draft ${p.draft} · queue ${p.queue} · publishing ${p.publishing} · today ${p.publishedToday} · retry ${p.retry}`,
    '',
    `Mission · run ${mi.running} · wait ${mi.waiting} · done ${mi.completed} · fail ${mi.failed}`,
    `Workload wait=${m.workload.waitingJobs} retry=${m.workload.retryJobs} fail=${m.workload.failedJobs} campaigns=${m.workload.runningCampaigns}`,
    `updated ${m.generatedAt} (${m.refreshReason})`,
  ];
}

export function formatRuntimeMetricsLines(m: OperationsMetricsSnapshot): string[] {
  const lines = [
    '══ Runtime Metrics ══',
    `machines=${m.machines.length} online=${m.fleet.machinesOnline} busy=${m.fleet.machinesBusy}`,
    `cpuAvg=${n(m.fleet.cpuAvg)} ramUsed%=${n(m.fleet.ramUsedPctAvg)}`,
    `chrome/browser busy=${m.fleet.browserBusy} idle=${m.fleet.browserIdle}`,
  ];
  for (const row of m.machines.slice(0, 10)) {
    lines.push(
      `• ${row.hostname} [${row.activity}] cpu=${n(row.cpuLoad1m)} rss=${n(row.rssMb)} jobs=${row.running}/${row.waiting} done=${row.completed} chrome=${row.chromeCount}${row.missionName ? ` m=${row.missionName}` : ''}`,
    );
  }
  lines.push(`updated ${m.generatedAt}`);
  return lines;
}

export function formatWorkMetricsLines(m: OperationsMetricsSnapshot): string[] {
  const lines = ['══ Work Metrics ══'];
  for (const row of m.machines.slice(0, 12)) {
    lines.push(
      `${row.displayName || row.hostname}`,
      `  assigned=${row.assigned} running=${row.running} completed=${row.completed} activity=${row.activity}`,
    );
    if (row.missionName) lines.push(`  mission=${row.missionName} step=${row.currentStep || '—'}`);
  }
  if (m.machines.length === 0) lines.push('(no machines)');
  return lines;
}
