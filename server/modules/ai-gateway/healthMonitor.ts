/**
 * In-memory health / usage metrics for AI providers.
 */

import type { GatewayProviderId, ProviderHealthStatus } from './types';

type CallRecord = {
  at: number;
  ok: boolean;
  latencyMs: number;
  quotaHint?: number | null;
};

const DAY_MS = 24 * 3600_000;
const WINDOW_MS = 60 * 60_000;

const store = new Map<GatewayProviderId, CallRecord[]>();
const lastLatency = new Map<GatewayProviderId, number>();
const lastQuota = new Map<GatewayProviderId, number | null>();
const lastError = new Map<GatewayProviderId, string | null>();

function bucket(id: GatewayProviderId): CallRecord[] {
  const now = Date.now();
  const prev = store.get(id) || [];
  const next = prev.filter(r => now - r.at < DAY_MS);
  store.set(id, next);
  return next;
}

export function recordProviderCall(
  id: GatewayProviderId,
  input: { ok: boolean; latencyMs: number; quotaHint?: number | null; error?: string | null },
): void {
  const rows = bucket(id);
  rows.push({
    at: Date.now(),
    ok: input.ok,
    latencyMs: input.latencyMs,
    quotaHint: input.quotaHint ?? null,
  });
  lastLatency.set(id, input.latencyMs);
  if (input.quotaHint != null) lastQuota.set(id, input.quotaHint);
  lastError.set(id, input.ok ? null : input.error || 'error');
}

export function getProviderMetrics(id: GatewayProviderId): {
  callsToday: number;
  successToday: number;
  successRate: number;
  errorRate: number;
  avgLatencyMs: number | null;
  lastLatencyMs: number | null;
  quotaPercent: number | null;
  lastError: string | null;
  recentErrorRate: number;
} {
  const rows = bucket(id);
  const callsToday = rows.length;
  const successToday = rows.filter(r => r.ok).length;
  const successRate = callsToday ? successToday / callsToday : 1;
  const errorRate = 1 - successRate;
  const avgLatencyMs = callsToday
    ? Math.round(rows.reduce((n, r) => n + r.latencyMs, 0) / callsToday)
    : null;
  const recent = rows.filter(r => Date.now() - r.at < WINDOW_MS);
  const recentErrorRate = recent.length
    ? 1 - recent.filter(r => r.ok).length / recent.length
    : 0;
  const quota =
    lastQuota.get(id) ??
    [...rows].reverse().find(r => r.quotaHint != null)?.quotaHint ??
    null;

  return {
    callsToday,
    successToday,
    successRate,
    errorRate,
    avgLatencyMs,
    lastLatencyMs: lastLatency.get(id) ?? null,
    quotaPercent: quota,
    lastError: lastError.get(id) ?? null,
    recentErrorRate,
  };
}

export function inferStatus(input: {
  configured: boolean;
  online: boolean;
  metrics: ReturnType<typeof getProviderMetrics>;
}): ProviderHealthStatus {
  if (!input.configured) return 'unconfigured';
  if (!input.online) return 'down';
  if (input.metrics.callsToday === 0) return 'idle';
  if (input.metrics.recentErrorRate >= 0.5) return 'degraded';
  if (input.metrics.quotaPercent != null && input.metrics.quotaPercent >= 95) return 'degraded';
  return 'healthy';
}

export function isQuotaExhaustedError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('429') ||
    m.includes('resource_exhausted') ||
    m.includes('quota') ||
    m.includes('rate-limit') ||
    m.includes('rate limit') ||
    m.includes('insufficient_quota')
  );
}
