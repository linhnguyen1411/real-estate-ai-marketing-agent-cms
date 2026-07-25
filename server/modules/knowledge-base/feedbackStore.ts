/**
 * Feedback loop persistence — evolution scores from real outcomes.
 */

import { prisma } from '../../prisma';
import type {
  CampaignEvolution,
  ContentEvolution,
  FeedbackEvent,
  MissionEvolution,
  SourceEvolution,
  WeeklyEvolutionSummary,
} from './feedbackTypes';

const SETTING_KEY = 'knowledge_feedback_h363';
const WEEK_MS = 7 * 24 * 3600_000;

type StoredFeedback = {
  events: FeedbackEvent[];
  sources: Record<string, SourceEvolution>;
  missions: Record<string, MissionEvolution>;
  contents: Record<string, ContentEvolution>;
  campaigns: Record<string, CampaignEvolution>;
  counters: {
    ruleImproved: number;
    ruleRemoved: number;
    campaignImproved: number;
    won: number;
    spam: number;
    buyer: number;
    lost: number;
  };
};

function emptyCounters(): StoredFeedback['counters'] {
  return {
    ruleImproved: 0,
    ruleRemoved: 0,
    campaignImproved: 0,
    won: 0,
    spam: 0,
    buyer: 0,
    lost: 0,
  };
}

async function load(): Promise<StoredFeedback> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  const data = (row?.data || {}) as Partial<StoredFeedback>;
  return {
    events: Array.isArray(data.events) ? data.events : [],
    sources: data.sources && typeof data.sources === 'object' ? data.sources : {},
    missions: data.missions && typeof data.missions === 'object' ? data.missions : {},
    contents: data.contents && typeof data.contents === 'object' ? data.contents : {},
    campaigns: data.campaigns && typeof data.campaigns === 'object' ? data.campaigns : {},
    counters: { ...emptyCounters(), ...(data.counters || {}) },
  };
}

async function save(state: StoredFeedback): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, data: state as object },
    update: { data: state as object },
  });
}

export async function appendFeedbackEvent(event: FeedbackEvent): Promise<StoredFeedback> {
  const state = await load();
  state.events.unshift(event);
  state.events = state.events.slice(0, 500);

  if (event.outcome === 'won') state.counters.won += 1;
  if (event.outcome === 'spam') state.counters.spam += 1;
  if (event.outcome === 'buyer' || event.outcome === 'qualified') state.counters.buyer += 1;
  if (event.outcome === 'lost') state.counters.lost += 1;

  // Source evolution
  if (event.sourceId) {
    const src = state.sources[event.sourceId] || {
      sourceId: event.sourceId,
      label: event.sourceLabel || event.sourceId.slice(0, 8),
      buyers: 0,
      spam: 0,
      won: 0,
      roiScore: 50,
      suggestedFrequency: 'hold' as const,
      frequencyMultiplier: 1,
    };
    if (event.sourceLabel) src.label = event.sourceLabel;
    if (event.outcome === 'buyer' || event.outcome === 'qualified' || event.outcome === 'won') {
      src.buyers += 1;
      src.roiScore = Math.min(100, src.roiScore + (event.outcome === 'won' ? 6 : 3));
    }
    if (event.outcome === 'spam' || event.outcome === 'discarded') {
      src.spam += 1;
      src.roiScore = Math.max(0, src.roiScore - 8);
    }
    if (event.outcome === 'won') src.won += 1;
    if (src.roiScore >= 70) {
      src.suggestedFrequency = 'increase';
      src.frequencyMultiplier = Math.min(2, 1 + (src.roiScore - 70) / 60);
    } else if (src.roiScore <= 35) {
      src.suggestedFrequency = 'decrease';
      src.frequencyMultiplier = Math.max(0.25, src.roiScore / 50);
    } else {
      src.suggestedFrequency = 'hold';
      src.frequencyMultiplier = 1;
    }
    state.sources[event.sourceId] = src;
  }

  // Mission evolution
  if (event.missionId) {
    const mis = state.missions[event.missionId] || {
      missionId: event.missionId,
      label: event.missionLabel || event.missionId.slice(0, 8),
      buyers: 0,
      emptyRuns: 0,
      priorityScore: 50,
      suggestedPriority: 'hold' as const,
    };
    if (event.missionLabel) mis.label = event.missionLabel;
    if (event.outcome === 'buyer' || event.outcome === 'qualified' || event.outcome === 'won') {
      mis.buyers += 1;
      mis.priorityScore = Math.min(100, mis.priorityScore + (event.outcome === 'won' ? 5 : 2));
    }
    if (event.outcome === 'spam' || event.outcome === 'discarded' || event.outcome === 'lost') {
      mis.emptyRuns += 1;
      mis.priorityScore = Math.max(0, mis.priorityScore - 3);
    }
    mis.suggestedPriority =
      mis.priorityScore >= 70 ? 'increase' : mis.priorityScore <= 35 ? 'decrease' : 'hold';
    state.missions[event.missionId] = mis;
  }

  // Content evolution
  if (event.contentId) {
    const c = state.contents[event.contentId] || {
      contentId: event.contentId,
      label: event.contentId.slice(0, 12),
      leads: 0,
      buyers: 0,
      won: 0,
      contentScore: 40,
    };
    c.leads += 1;
    if (event.outcome === 'buyer' || event.outcome === 'qualified') {
      c.buyers += 1;
      c.contentScore = Math.min(100, c.contentScore + 4);
    }
    if (event.outcome === 'won') {
      c.won += 1;
      c.contentScore = Math.min(100, c.contentScore + 12);
    }
    if (event.outcome === 'spam') c.contentScore = Math.max(0, c.contentScore - 10);
    state.contents[event.contentId] = c;
  }

  // Campaign evolution
  if (event.campaignKey) {
    const key = event.campaignKey.trim().toLowerCase();
    const camp = state.campaigns[key] || {
      campaignKey: key,
      label: event.campaignKey,
      pipeline: 0,
      won: 0,
      revenue: 0,
      roi: 0,
      rank: 0,
    };
    camp.pipeline += 1;
    if (event.outcome === 'won') {
      camp.won += 1;
      camp.revenue += event.revenue || 0;
      state.counters.campaignImproved += 1;
    }
    camp.roi = camp.pipeline ? Math.round((camp.won / camp.pipeline) * 1000) / 10 : 0;
    state.campaigns[key] = camp;
  }

  // Rank campaigns
  const ranked = Object.values(state.campaigns).sort(
    (a, b) => b.roi - a.roi || b.revenue - a.revenue || b.won - a.won,
  );
  ranked.forEach((c, i) => {
    c.rank = i + 1;
    state.campaigns[c.campaignKey] = c;
  });

  await save(state);
  return state;
}

export async function bumpRuleImproved(): Promise<void> {
  const state = await load();
  state.counters.ruleImproved += 1;
  await save(state);
}

export async function bumpRuleRemoved(): Promise<void> {
  const state = await load();
  state.counters.ruleRemoved += 1;
  await save(state);
}

export async function loadFeedbackState(): Promise<StoredFeedback> {
  return load();
}

export function computeWeeklySummary(
  state: StoredFeedback,
  topConcept: string | null,
): WeeklyEvolutionSummary {
  const weekAgo = Date.now() - WEEK_MS;
  const weekEvents = state.events.filter(e => new Date(e.at).getTime() >= weekAgo);
  const won = weekEvents.filter(e => e.outcome === 'won').length;
  const buyerish = weekEvents.filter(
    e => e.outcome === 'won' || e.outcome === 'buyer' || e.outcome === 'qualified',
  ).length;
  const spam = weekEvents.filter(e => e.outcome === 'spam').length;
  const denom = buyerish + spam || state.counters.won + state.counters.spam || 1;
  const accuracy = Math.round((buyerish / denom) * 1000) / 10;

  const sources = Object.values(state.sources).sort((a, b) => b.roiScore - a.roiScore);
  return {
    buyerAccuracy: accuracy,
    ruleImproved: state.counters.ruleImproved,
    ruleRemoved: state.counters.ruleRemoved,
    campaignImproved: state.counters.campaignImproved,
    topSource: sources[0]?.label || null,
    worstSource: sources.length ? sources[sources.length - 1]?.label || null : null,
    topConcept,
    eventsThisWeek: weekEvents.length,
    updatedAt: new Date().toISOString(),
  };
}
