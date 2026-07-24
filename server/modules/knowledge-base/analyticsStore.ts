/**
 * Persist per-rule / location / source / mission analytics counters.
 */

import { prisma } from '../../prisma';
import type {
  LocationStat,
  MissionStat,
  RuleStat,
  SourceStat,
} from './analyticsTypes';

const SETTING_KEY = 'knowledge_analytics_h361';
const DAY_MS = 24 * 3600_000;

type FalseNeg = { term: string; count: number; suggestedConcept: string; at: string };

type StoredAnalytics = {
  rules: Record<string, RuleStat>;
  locations: Record<string, LocationStat>;
  sources: Record<string, SourceStat>;
  missions: Record<string, MissionStat>;
  falseNegatives: FalseNeg[];
  events: {
    scanned: number;
    ruleMatched: number;
    discarded: number;
    unknownHits: number;
    approvals: number;
    learningEvents: number;
  };
};

function emptyEvents(): StoredAnalytics['events'] {
  return {
    scanned: 0,
    ruleMatched: 0,
    discarded: 0,
    unknownHits: 0,
    approvals: 0,
    learningEvents: 0,
  };
}

async function load(): Promise<StoredAnalytics> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  const data = (row?.data || {}) as Partial<StoredAnalytics>;
  return {
    rules: data.rules && typeof data.rules === 'object' ? data.rules : {},
    locations: data.locations && typeof data.locations === 'object' ? data.locations : {},
    sources: data.sources && typeof data.sources === 'object' ? data.sources : {},
    missions: data.missions && typeof data.missions === 'object' ? data.missions : {},
    falseNegatives: Array.isArray(data.falseNegatives) ? data.falseNegatives : [],
    events: { ...emptyEvents(), ...(data.events || {}) },
  };
}

async function save(state: StoredAnalytics): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, data: state as object },
    update: { data: state as object },
  });
}

function ruleKey(keyword: string, category: string) {
  return `${category}::${keyword.trim().toLowerCase()}`;
}

export async function recordRuleDecisionEvent(input: {
  matchedKeywords: Array<{ keyword: string; category: string; conceptId?: string | null; conceptName?: string }>;
  decision: string;
  intent?: string;
  locationLabel?: string | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
  missionId?: string | null;
  missionLabel?: string | null;
  missionKeyword?: string | null;
  hadUnknown?: boolean;
}): Promise<void> {
  const state = await load();
  const now = new Date().toISOString();
  state.events.scanned += 1;
  if (input.matchedKeywords.length) state.events.ruleMatched += 1;
  if (input.decision === 'discard') state.events.discarded += 1;
  if (input.hadUnknown) state.events.unknownHits += 1;

  const isQualified =
    input.decision === 'qualified_candidate' ||
    (input.decision === 'ai_review' && input.intent === 'buyer');
  const isBuyerQualified = isQualified && (input.intent === 'buyer' || !input.intent);

  for (const hit of input.matchedKeywords) {
    const key = ruleKey(hit.keyword, hit.category);
    const prev = state.rules[key];
    const row: RuleStat = prev || {
      keyword: hit.keyword.toLowerCase(),
      category: hit.category,
      conceptId: hit.conceptId || null,
      conceptName: hit.conceptName || hit.category,
      matched: 0,
      qualified: 0,
      converted: 0,
      falsePositive: 0,
      lastMatchedAt: null,
      firstSeenAt: now,
    };
    row.matched += 1;
    row.lastMatchedAt = now;
    if (hit.conceptId) row.conceptId = hit.conceptId;
    if (hit.conceptName) row.conceptName = hit.conceptName;
    if (isBuyerQualified) row.qualified += 1;
    // matched but not buyer-qualified → soft FP signal
    if (!isBuyerQualified && hit.category === 'buyer') row.falsePositive += 1;
    state.rules[key] = row;
  }

  if (input.locationLabel) {
    const lk = input.locationLabel.trim().toLowerCase();
    const loc = state.locations[lk] || {
      key: lk,
      label: input.locationLabel,
      matched: 0,
      qualified: 0,
      won: 0,
    };
    loc.matched += 1;
    if (isQualified) loc.qualified += 1;
    state.locations[lk] = loc;
  }

  if (input.sourceId) {
    const sk = input.sourceId;
    const src = state.sources[sk] || {
      sourceId: sk,
      label: input.sourceLabel || sk.slice(0, 8),
      scanned: 0,
      qualified: 0,
      converted: 0,
    };
    src.scanned += 1;
    if (isQualified) src.qualified += 1;
    if (input.sourceLabel) src.label = input.sourceLabel;
    state.sources[sk] = src;
  }

  if (input.missionId) {
    const mk = input.missionId;
    const mis = state.missions[mk] || {
      missionId: mk,
      label: input.missionLabel || mk.slice(0, 8),
      keyword: input.missionKeyword || input.missionLabel || '',
      buyer: 0,
      won: 0,
    };
    if (isBuyerQualified) mis.buyer += 1;
    if (input.missionLabel) mis.label = input.missionLabel;
    if (input.missionKeyword) mis.keyword = input.missionKeyword;
    state.missions[mk] = mis;
  }

  await save(state);
}

export async function recordRuleConversion(input: {
  keywords: string[];
  locationLabel?: string | null;
  sourceId?: string | null;
  missionId?: string | null;
}): Promise<void> {
  const state = await load();
  for (const kw of input.keywords) {
    const needle = kw.trim().toLowerCase();
    for (const [key, row] of Object.entries(state.rules)) {
      if (row.keyword === needle || key.endsWith(`::${needle}`)) {
        row.converted += 1;
      }
    }
  }
  if (input.locationLabel) {
    const lk = input.locationLabel.trim().toLowerCase();
    if (state.locations[lk]) state.locations[lk].won += 1;
  }
  if (input.sourceId && state.sources[input.sourceId]) {
    state.sources[input.sourceId].converted += 1;
  }
  if (input.missionId && state.missions[input.missionId]) {
    state.missions[input.missionId].won += 1;
  }
  await save(state);
}

export async function recordFalseNegative(input: {
  term: string;
  suggestedConcept?: string;
}): Promise<void> {
  const state = await load();
  const term = input.term.trim().toLowerCase();
  if (!term) return;
  const existing = state.falseNegatives.find(f => f.term === term);
  if (existing) {
    existing.count += 1;
    existing.at = new Date().toISOString();
  } else {
    state.falseNegatives.unshift({
      term,
      count: 1,
      suggestedConcept: input.suggestedConcept || 'Buyer Intent',
      at: new Date().toISOString(),
    });
  }
  state.falseNegatives = state.falseNegatives.slice(0, 200);
  state.events.approvals += 1;
  await save(state);
}

export async function bumpLearningEvent(): Promise<void> {
  const state = await load();
  state.events.learningEvents += 1;
  await save(state);
}

export async function loadAnalyticsState(): Promise<StoredAnalytics> {
  return load();
}

export function daysSince(iso: string | null): number {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / DAY_MS;
}
