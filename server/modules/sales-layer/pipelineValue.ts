/**
 * Pipeline Value KPIs — revenue intelligence for Sales Layer.
 */

import type { PipelineValueMetrics, SalesLayerProfile, SalesPipelineStage } from './types';
import { STAGE_PROBABILITY } from './types';

function toTy(v: number | bigint | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'bigint' ? Number(v) : v;
  if (!Number.isFinite(n) || n <= 0) return 0;
  // budgets stored as tỷ already in many findings; if huge assume VND → tỷ
  return n > 1000 ? n / 1_000_000_000 : n;
}

export function estimateDealTy(input: {
  budgetMin?: number | bigint | null;
  budgetMax?: number | bigint | null;
  askingPrice?: number | bigint | null;
}): number {
  const max = toTy(input.budgetMax);
  const min = toTy(input.budgetMin);
  const ask = toTy(input.askingPrice);
  if (max > 0 && min > 0) return (min + max) / 2;
  if (max > 0) return max;
  if (min > 0) return min;
  if (ask > 0) return ask;
  return 5; // default average deal assumption (tỷ)
}

export function probabilityForStage(stage: SalesPipelineStage, override?: number | null): number {
  if (override != null && Number.isFinite(override)) return Math.max(0, Math.min(1, override));
  return STAGE_PROBABILITY[stage] ?? 0.1;
}

export function aggregatePipelineValue(
  rows: Array<{
    profile: SalesLayerProfile;
    budgetMin?: number | bigint | null;
    budgetMax?: number | bigint | null;
    askingPrice?: number | bigint | null;
    campaignId?: string | null;
    campaignName?: string | null;
    sourceId?: string | null;
    sourceName?: string | null;
    createdAt?: Date | string | null;
    closedAt?: Date | string | null;
  }>,
): PipelineValueMetrics {
  const metrics: PipelineValueMetrics = {
    detected: 0,
    qualified: 0,
    assigned: 0,
    contacted: 0,
    appointment: 0,
    negotiating: 0,
    won: 0,
    lost: 0,
    pipelineValueTy: 0,
    estimatedRevenueTy: 0,
    expectedRevenueTy: 0,
    averageDealSizeTy: 0,
    winRate: 0,
    averageDays: 0,
    needFollowUp: 0,
    urgentBuyers: 0,
    byCampaign: [],
    bySource: [],
  };

  const byCampaign = new Map<
    string,
    {
      campaignId: string;
      name: string;
      leads: number;
      qualified: number;
      negotiating: number;
      closed: number;
      pipelineValueTy: number;
      expectedRevenueTy: number;
    }
  >();
  const bySource = new Map<
    string,
    { sourceId: string; name: string; leads: number; won: number; pipelineValueTy: number }
  >();

  let dealSum = 0;
  let dealCount = 0;
  let closedWon = 0;
  let closedLost = 0;
  let daysSum = 0;
  let daysCount = 0;

  for (const row of rows) {
    const stage = row.profile.pipelineStage;
    metrics[stage] = (metrics[stage] || 0) + 1;
    const deal = row.profile.expectedDealTy ?? estimateDealTy(row);
    const p = probabilityForStage(stage, row.profile.probability);
    dealSum += deal;
    dealCount += 1;

    if (stage !== 'won' && stage !== 'lost') {
      metrics.pipelineValueTy += deal;
      metrics.expectedRevenueTy += deal * p;
    }
    metrics.estimatedRevenueTy += deal;

    if (row.profile.followUp.needsFollowUp) metrics.needFollowUp += 1;
    if (row.profile.recommendation.urgency === 'urgent') metrics.urgentBuyers += 1;

    if (stage === 'won') closedWon += 1;
    if (stage === 'lost') closedLost += 1;

    if (row.createdAt && (stage === 'won' || stage === 'lost' || row.closedAt)) {
      const start = new Date(row.createdAt).getTime();
      const end = new Date(row.closedAt || row.profile.updatedAt).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        daysSum += (end - start) / 86_400_000;
        daysCount += 1;
      }
    }

    const cid = row.campaignId || 'unmatched';
    const cname = row.campaignName || 'Unmatched';
    const c = byCampaign.get(cid) || {
      campaignId: cid,
      name: cname,
      leads: 0,
      qualified: 0,
      negotiating: 0,
      closed: 0,
      pipelineValueTy: 0,
      expectedRevenueTy: 0,
    };
    c.leads += 1;
    if (['qualified', 'assigned', 'contacted', 'appointment', 'negotiating', 'won'].includes(stage)) {
      c.qualified += 1;
    }
    if (stage === 'negotiating') c.negotiating += 1;
    if (stage === 'won') c.closed += 1;
    if (stage !== 'won' && stage !== 'lost') {
      c.pipelineValueTy += deal;
      c.expectedRevenueTy += deal * p;
    }
    byCampaign.set(cid, c);

    const sid = row.sourceId || 'unknown';
    const s = bySource.get(sid) || {
      sourceId: sid,
      name: row.sourceName || sid,
      leads: 0,
      won: 0,
      pipelineValueTy: 0,
    };
    s.leads += 1;
    if (stage === 'won') s.won += 1;
    if (stage !== 'won' && stage !== 'lost') s.pipelineValueTy += deal;
    bySource.set(sid, s);
  }

  metrics.averageDealSizeTy = dealCount ? Math.round((dealSum / dealCount) * 10) / 10 : 0;
  const closedTotal = closedWon + closedLost;
  metrics.winRate = closedTotal ? Math.round((closedWon / closedTotal) * 1000) / 10 : 0;
  metrics.averageDays = daysCount ? Math.round((daysSum / daysCount) * 10) / 10 : 0;
  metrics.pipelineValueTy = Math.round(metrics.pipelineValueTy * 10) / 10;
  metrics.estimatedRevenueTy = Math.round(metrics.estimatedRevenueTy * 10) / 10;
  metrics.expectedRevenueTy = Math.round(metrics.expectedRevenueTy * 10) / 10;
  metrics.byCampaign = [...byCampaign.values()].sort((a, b) => b.leads - a.leads).slice(0, 20);
  metrics.bySource = [...bySource.values()].sort((a, b) => b.leads - a.leads).slice(0, 20);
  return metrics;
}

export function formatTy(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100) return `${Math.round(n)} tỷ`;
  return `${Math.round(n * 10) / 10} tỷ`;
}

/** Normalize budget/price storage (tỷ or VND) → tỷ units. */
export function normalizeTy(v: number | bigint | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'bigint' ? Number(v) : v;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1000 ? n / 1_000_000_000 : n;
}
