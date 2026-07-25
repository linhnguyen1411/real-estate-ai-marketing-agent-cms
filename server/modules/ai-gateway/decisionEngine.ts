/**
 * Decision Engine — choose provider order by priority, health, quota, latency.
 */

import { getProviderMetrics } from './healthMonitor';
import type { AIProvider, GatewayDecision, GatewayProviderId, ProviderHealth } from './types';
import { mapLegacyProvider } from './types';

const DEFAULT_ORDER: GatewayProviderId[] = ['gemini', 'kira', 'local'];

export function resolvePreferredOrder(
  preferred?: Array<string | GatewayProviderId>,
): GatewayProviderId[] {
  if (!preferred?.length) return [...DEFAULT_ORDER];
  const mapped = preferred
    .map(p => mapLegacyProvider(String(p)) || (p as GatewayProviderId))
    .filter((p, i, arr): p is GatewayProviderId =>
      Boolean(p) && DEFAULT_ORDER.includes(p as GatewayProviderId) && arr.indexOf(p) === i,
    );
  // Append missing defaults so fallback chain stays complete
  for (const id of DEFAULT_ORDER) {
    if (!mapped.includes(id)) mapped.push(id);
  }
  return mapped.length ? mapped : [...DEFAULT_ORDER];
}

export function decideProviderOrder(input: {
  providers: AIProvider[];
  health: ProviderHealth[];
  preferred?: Array<string | GatewayProviderId>;
}): GatewayDecision {
  const preferred = resolvePreferredOrder(input.preferred);
  const healthMap = new Map(input.health.map(h => [h.id, h]));
  const reasons: string[] = [];

  const scored = preferred.map(id => {
    const h = healthMap.get(id);
    const metrics = getProviderMetrics(id);
    let score = 100 - (input.providers.find(p => p.id === id)?.priority || 3) * 5;

    if (!h || h.status === 'unconfigured') {
      score -= 1000;
      reasons.push(`${id}:unconfigured`);
    } else if (h.status === 'down') {
      score -= 500;
      reasons.push(`${id}:down`);
    } else if (h.status === 'degraded') {
      score -= 80;
      reasons.push(`${id}:degraded`);
    }

    if (h?.quotaPercent != null && h.quotaPercent >= 95) {
      score -= 200;
      reasons.push(`${id}:quota_exhausted`);
    } else if (h?.quotaPercent != null && h.quotaPercent >= 85) {
      score -= 40;
      reasons.push(`${id}:quota_high`);
    }

    if (metrics.recentErrorRate >= 0.4) {
      score -= 60;
      reasons.push(`${id}:error_rate`);
    }

    const latency = h?.avgLatencyMs ?? h?.latencyMs;
    if (latency != null) {
      if (latency > 8000) score -= 40;
      else if (latency > 3000) score -= 15;
      else if (latency < 800) score += 10;
    }

    if (h?.status === 'healthy') score += 20;
    if (h?.status === 'idle' && h.online) score += 5;

    return { id, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return preferred.indexOf(a.id) - preferred.indexOf(b.id);
  });
  // Viable first (score-ranked); exhausted/unconfigured keep preferred cascade order
  const viable = scored.filter(s => s.score > -400).map(s => s.id);
  const rest = preferred.filter(id => !viable.includes(id));
  const order = [...viable, ...rest];

  return {
    order: order.length ? order : preferred,
    reason: reasons.slice(0, 8).join(',') || 'priority_default',
  };
}
