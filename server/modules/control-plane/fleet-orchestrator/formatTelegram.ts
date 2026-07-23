/**
 * Telegram / report formatters for Fleet Orchestrator (G2).
 */

import type { OrchestratorSnapshot, PlacementDecision } from './types';

export function formatOrchestratorOverviewLines(snap: OrchestratorSnapshot): string[] {
  const lines = [
    '══ Fleet Orchestrator ══',
    `policy=${snap.policyDefault} · assignments=${snap.stats.assignments} rejects=${snap.stats.rejections}`,
    `reassign=${snap.stats.reassigns} failover=${snap.stats.failovers} reservationExpired=${snap.stats.reservationsExpired}`,
    `reservations=${snap.reservations.length} cooldowns=${snap.cooldowns.length} decisions=${snap.recentDecisions.length}`,
  ];
  if (snap.machines.length) {
    lines.push('Policies:');
    for (const m of snap.machines.slice(0, 8)) {
      lines.push(
        `• ${m.hostname || m.agentId || m.machineId} mode=${m.mode} pins(m=${m.pinnedMissionIds.length},s=${m.pinnedSourceIds.length})`,
      );
    }
  }
  return lines;
}

export function formatPlacementDecisionLines(d: PlacementDecision): string[] {
  const lines = [
    `Placement ${d.chosen ? 'CHOSEN' : 'NONE'}`,
    `agent=${d.agentId} job=${d.jobId || '—'} type=${d.jobType || '—'}`,
    `score=${d.score ?? '—'} policy=${d.policyMode}`,
  ];
  if (d.breakdown) {
    lines.push(
      `scores cap=${d.breakdown.capability} browser=${d.breakdown.browser} load=${Math.round(d.breakdown.load)} affinity=${d.breakdown.affinity} prio=${d.breakdown.priority} policy=${d.breakdown.policy}`,
    );
  }
  if (d.reasons.length) lines.push(`reasons: ${d.reasons.slice(0, 8).join(', ')}`);
  if (d.rejected.length) {
    lines.push(`rejected (${d.rejected.length}):`);
    for (const r of d.rejected.slice(0, 5)) {
      lines.push(`  • ${r.jobId.slice(0, 10)} ${r.reason}`);
    }
  }
  return lines;
}

export function formatOrchestratorReportLines(snap: OrchestratorSnapshot): string[] {
  const lines = formatOrchestratorOverviewLines(snap);
  lines.push('Recent decisions:');
  if (snap.recentDecisions.length === 0) {
    lines.push('(none yet)');
  } else {
    for (const d of snap.recentDecisions.slice(0, 8)) {
      lines.push(
        `• ${d.at.slice(11, 19)} ${d.agentId} → ${d.jobType || '—'} score=${d.score ?? '—'} ${d.chosen ? 'ok' : 'skip'}`,
      );
    }
  }
  if (snap.cooldowns.length) {
    lines.push('Cooldowns:');
    for (const c of snap.cooldowns.slice(0, 5)) {
      const left = Math.max(0, Math.round((c.until - Date.now()) / 1000));
      lines.push(`• ${c.jobId.slice(0, 10)} fail=${c.failures} left=${left}s`);
    }
  }
  return lines;
}
