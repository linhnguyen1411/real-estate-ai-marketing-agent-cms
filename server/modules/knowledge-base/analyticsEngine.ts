/**
 * Rule analytics engine + optimizer recommendations (no AI, no new rules).
 */

import { listConcepts, listSuggestions, listUnknownTerms, getRuleCoverage } from './store';
import {
  daysSince,
  loadAnalyticsState,
} from './analyticsStore';
import type {
  KnowledgeAnalyticsSnapshot,
  KnowledgeScorecard,
  OptimizerRecommendation,
  RuleAnalyticsRow,
  RuleRoiLabel,
} from './analyticsTypes';

function accuracyOf(matched: number, qualified: number): number {
  if (!matched) return 0;
  return Math.round((qualified / matched) * 1000) / 10;
}

function roiOf(row: { matched: number; qualified: number; converted: number; accuracy: number }): RuleRoiLabel {
  if (row.matched === 0) return 'dead';
  if (row.converted >= 5 && row.accuracy >= 70) return 'excellent';
  if (row.accuracy >= 70 || (row.converted >= 2 && row.accuracy >= 50)) return 'high';
  if (row.accuracy >= 30) return 'medium';
  return 'low';
}

function statusOf(row: RuleAnalyticsRow): RuleAnalyticsRow['status'] {
  if (row.matched === 0 || daysSince(row.lastMatchedAt) >= 30) return 'dead';
  if (row.matched < 3 && daysSince(row.firstSeenAt) >= 14) return 'unused';
  if (row.matched >= 30 && row.accuracy < 15) return 'false_positive';
  if (row.matched >= 20 && row.accuracy < 40) return 'needs_tune';
  return 'active';
}

function enrichRule(stat: {
  keyword: string;
  category: string;
  conceptId: string | null;
  conceptName: string;
  matched: number;
  qualified: number;
  converted: number;
  falsePositive: number;
  lastMatchedAt: string | null;
  firstSeenAt: string;
}): RuleAnalyticsRow {
  const accuracy = accuracyOf(stat.matched, stat.qualified);
  const base: RuleAnalyticsRow = {
    ...stat,
    accuracy,
    roi: 'low',
    status: 'active',
  };
  base.roi = roiOf(base);
  base.status = statusOf(base);
  return base;
}

export async function buildKnowledgeAnalytics(): Promise<KnowledgeAnalyticsSnapshot> {
  const [state, concepts, unknown, suggestions, coverage] = await Promise.all([
    loadAnalyticsState(),
    listConcepts(),
    listUnknownTerms(),
    listSuggestions('pending'),
    getRuleCoverage(),
  ]);

  // Ensure every enabled alias appears (unused/dead visibility)
  const ruleMap = { ...state.rules };
  const now = new Date().toISOString();
  for (const c of concepts.filter(x => x.enabled)) {
    for (const alias of [...c.aliases, ...c.synonyms]) {
      const kw = alias.trim().toLowerCase();
      if (!kw) continue;
      const key = `${c.category}::${kw}`;
      if (!ruleMap[key]) {
        ruleMap[key] = {
          keyword: kw,
          category: c.category,
          conceptId: c.id,
          conceptName: c.concept,
          matched: 0,
          qualified: 0,
          converted: 0,
          falsePositive: 0,
          lastMatchedAt: null,
          firstSeenAt: c.updatedAt || now,
        };
      }
    }
  }

  const rows = Object.values(ruleMap).map(enrichRule);
  const topRules = [...rows].sort((a, b) => b.qualified - a.qualified || b.matched - a.matched).slice(0, 30);
  const unusedRules = rows.filter(r => r.status === 'unused').slice(0, 40);
  const deadRules = rows.filter(r => r.status === 'dead').slice(0, 40);
  const falsePositives = rows
    .filter(r => r.status === 'false_positive' || (r.matched >= 30 && r.accuracy < 20))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 30);

  const buyerQualifiedTotal = rows
    .filter(r => r.category === 'buyer' || r.category === 'signal')
    .reduce((n, r) => n + r.qualified, 0);
  const topContributors = [...rows]
    .filter(r => r.qualified > 0)
    .sort((a, b) => b.qualified - a.qualified)
    .slice(0, 20)
    .map(r => ({
      keyword: r.keyword,
      qualified: r.qualified,
      sharePercent: buyerQualifiedTotal
        ? Math.round((r.qualified / buyerQualifiedTotal) * 1000) / 10
        : 0,
    }));

  const sources = Object.values(state.sources)
    .map(s => {
      const rate = s.scanned ? s.qualified / s.scanned : 0;
      const roi: RuleRoiLabel =
        rate >= 0.1 ? 'high' : rate >= 0.03 ? 'medium' : s.scanned >= 100 ? 'low' : 'medium';
      return {
        ...s,
        roi,
        recommendation:
          roi === 'low'
            ? 'Giảm tần suất scan'
            : roi === 'high'
              ? 'Tăng tần suất scan'
              : 'Giữ nguyên',
      };
    })
    .sort((a, b) => b.qualified - a.qualified);

  const missions = Object.values(state.missions)
    .map(m => {
      const roi: RuleRoiLabel =
        m.won >= 3 && m.buyer >= 10
          ? 'excellent'
          : m.buyer >= 5
            ? 'high'
            : m.buyer > 0
              ? 'medium'
              : 'low';
      return { ...m, roi };
    })
    .sort((a, b) => b.won - a.won || b.buyer - a.buyer);

  const recommendations: OptimizerRecommendation[] = [];
  for (const d of deadRules.slice(0, 15)) {
    recommendations.push({
      id: `archive_${d.keyword}`,
      kind: 'archive',
      title: `Archive "${d.keyword}"`,
      detail: 'Không match trong 30 ngày — đề xuất archive.',
      target: d.keyword,
      priority: 20,
    });
  }
  for (const fp of falsePositives.slice(0, 10)) {
    recommendations.push({
      id: `reduce_${fp.keyword}`,
      kind: 'reduce_weight',
      title: `Giảm weight "${fp.keyword}"`,
      detail: `Matched ${fp.matched}, accuracy ${fp.accuracy}% — false positive cao.`,
      target: fp.keyword,
      priority: 10,
    });
  }
  for (const fn of state.falseNegatives.slice(0, 8)) {
    recommendations.push({
      id: `syn_${fn.term}`,
      kind: 'add_synonym',
      title: `Thêm synonym "${fn.term}"`,
      detail: `False negative ×${fn.count} → đề xuất concept ${fn.suggestedConcept}.`,
      target: fn.term,
      priority: 5,
    });
  }
  for (const s of sources.filter(x => x.roi === 'low').slice(0, 5)) {
    recommendations.push({
      id: `src_low_${s.sourceId}`,
      kind: 'review_source',
      title: `Giảm tần suất ${s.label}`,
      detail: `Scanned ${s.scanned}, Qualified ${s.qualified} — ROI Low.`,
      target: s.sourceId,
      priority: 30,
    });
  }
  for (const s of sources.filter(x => x.roi === 'high').slice(0, 5)) {
    recommendations.push({
      id: `src_hi_${s.sourceId}`,
      kind: 'boost_source',
      title: `Tăng tần suất ${s.label}`,
      detail: `Scanned ${s.scanned}, Qualified ${s.qualified} — ROI High.`,
      target: s.sourceId,
      priority: 25,
    });
  }
  recommendations.sort((a, b) => a.priority - b.priority);

  const matchedTotal = rows.reduce((n, r) => n + r.matched, 0);
  const qualifiedTotal = rows.reduce((n, r) => n + r.qualified, 0);
  const convertedTotal = rows.reduce((n, r) => n + r.converted, 0);
  const overallAccuracy = matchedTotal ? Math.round((qualifiedTotal / matchedTotal) * 1000) / 10 : 0;

  const score = computeKnowledgeScore({
    coveragePercent: coverage.ruleMatchPercent || (state.events.scanned
      ? Math.round((state.events.ruleMatched / state.events.scanned) * 1000) / 10
      : 0),
    overallAccuracy,
    deadCount: deadRules.length,
    totalRules: rows.length,
    unknownCount: unknown.length,
    pendingApprovals: suggestions.length,
    learningEvents: state.events.learningEvents,
    approvals: state.events.approvals,
  });

  return {
    version: 'h361_analytics_v1',
    score,
    topRules,
    unusedRules,
    deadRules,
    falsePositives,
    falseNegatives: state.falseNegatives.slice(0, 40),
    topContributors,
    locations: Object.values(state.locations).sort((a, b) => b.qualified - a.qualified),
    sources,
    missions,
    recommendations: recommendations.slice(0, 40),
    coverage: {
      scanned: state.events.scanned || coverage.scanned,
      ruleMatchPercent:
        state.events.scanned
          ? Math.round((state.events.ruleMatched / state.events.scanned) * 1000) / 10
          : coverage.ruleMatchPercent,
      discardPercent:
        state.events.scanned
          ? Math.round((state.events.discarded / state.events.scanned) * 1000) / 10
          : coverage.discardPercent,
      unknownPercent:
        state.events.scanned
          ? Math.round((state.events.unknownHits / state.events.scanned) * 1000) / 10
          : coverage.unknownPercent,
    },
    totals: {
      rulesTracked: rows.length,
      matchedTotal,
      qualifiedTotal,
      convertedTotal,
      deadCount: deadRules.length,
      unknownCount: unknown.length,
    },
  };
}

function computeKnowledgeScore(input: {
  coveragePercent: number;
  overallAccuracy: number;
  deadCount: number;
  totalRules: number;
  unknownCount: number;
  pendingApprovals: number;
  learningEvents: number;
  approvals: number;
}): KnowledgeScorecard {
  const coverage = Math.min(100, input.coveragePercent);
  const accuracy = Math.min(100, input.overallAccuracy);
  const freshness = Math.max(
    0,
    100 - (input.totalRules ? (input.deadCount / input.totalRules) * 100 : 0) - input.unknownCount * 2,
  );
  const approvalRate = input.pendingApprovals + input.approvals
    ? Math.round((input.approvals / (input.pendingApprovals + input.approvals)) * 1000) / 10
    : 100;
  const learningRate = Math.min(100, input.learningEvents * 5);
  const overall =
    Math.round(
      (coverage * 0.3 + accuracy * 0.3 + freshness * 0.2 + approvalRate * 0.1 + learningRate * 0.1) * 10,
    ) / 10;
  return {
    coverage: Math.round(coverage * 10) / 10,
    accuracy: Math.round(accuracy * 10) / 10,
    freshness: Math.round(freshness * 10) / 10,
    approvalRate,
    learningRate: Math.round(learningRate * 10) / 10,
    overall,
  };
}

export function formatKnowledgeHealthBriefing(snap: KnowledgeAnalyticsSnapshot): string {
  const top = snap.topRules[0];
  const archiveN = snap.recommendations.filter(r => r.kind === 'archive').length;
  const syn = snap.recommendations.find(r => r.kind === 'add_synonym');
  const lines = [
    'Knowledge Health',
    '',
    'Coverage',
    `${snap.score.coverage}%`,
    '',
    'Top Rule',
    top ? `"${top.keyword}"` : '—',
    'Accuracy',
    top ? `${top.accuracy}%` : '—',
    '',
    'Dead Rules',
    String(snap.totals.deadCount),
    '',
    'Unknown',
    String(snap.totals.unknownCount),
    '',
    'Recommendation',
    archiveN ? `Archive ${archiveN} rules` : 'No archive needed',
  ];
  if (syn) {
    lines.push('Thêm synonym');
    lines.push(`"${syn.target}"`);
  }
  return lines.join('\n');
}
