/**
 * Continuous feedback engine — apply outcomes to Knowledge Trust + evolution.
 * Does not call AI. Does not mutate Scanner / Sales Layer / Runtime.
 */

import { listConcepts, upsertConcept } from './store';
import { recordRuleConversion } from './analyticsStore';
import {
  appendFeedbackEvent,
  bumpRuleImproved,
  bumpRuleRemoved,
  computeWeeklySummary,
  loadFeedbackState,
} from './feedbackStore';
import type {
  ConceptTrustRow,
  FeedbackCenterSnapshot,
  FeedbackOutcome,
} from './feedbackTypes';

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function trustDelta(outcome: FeedbackOutcome): number {
  switch (outcome) {
    case 'won':
      return 8;
    case 'buyer':
    case 'qualified':
      return 3;
    case 'lost':
      return -4;
    case 'spam':
      return -12;
    case 'discarded':
      return -6;
    default:
      return 0;
  }
}

export async function applyOutcomeFeedback(input: {
  outcome: FeedbackOutcome;
  keywords?: string[];
  conceptIds?: string[];
  sourceId?: string | null;
  sourceLabel?: string | null;
  missionId?: string | null;
  missionLabel?: string | null;
  campaignKey?: string | null;
  contentId?: string | null;
  revenue?: number;
  note?: string | null;
}): Promise<{
  eventId: string;
  trustUpdates: ConceptTrustRow[];
  autoTune: Array<{ conceptId: string; concept: string; kind: string; detail: string }>;
}> {
  const concepts = await listConcepts();
  const keywords = (input.keywords || []).map(k => k.trim().toLowerCase()).filter(Boolean);
  const conceptIds = new Set(input.conceptIds || []);

  // Resolve concepts by id or keyword alias
  const matched = concepts.filter(c => {
    if (conceptIds.has(c.id)) return true;
    const terms = [...c.aliases, ...c.synonyms].map(t => t.toLowerCase());
    return keywords.some(k => terms.includes(k));
  });

  const delta = trustDelta(input.outcome);
  const trustUpdates: ConceptTrustRow[] = [];
  const autoTune: Array<{ conceptId: string; concept: string; kind: string; detail: string }> = [];

  for (const concept of matched) {
    const before = typeof concept.trust === 'number' ? concept.trust : 70;
    const after = clamp(before + delta);
    let weight = concept.weight;
    let action: ConceptTrustRow['action'] = delta > 0 ? 'boost' : delta < 0 ? 'penalize' : 'none';

    // Auto-tuning
    if (after > 90 && Math.abs(weight) > 0) {
      const nextWeight =
        weight > 0 ? Math.min(80, weight + 2) : Math.max(-90, weight - 2);
      if (nextWeight !== weight) {
        weight = nextWeight;
        action = 'increase_weight';
        autoTune.push({
          conceptId: concept.id,
          concept: concept.concept,
          kind: 'increase_weight',
          detail: `Trust ${after} > 90 → weight ${concept.weight} → ${weight}`,
        });
        await bumpRuleImproved();
      }
    }
    if (after < 20) {
      action = 'suggest_archive';
      autoTune.push({
        conceptId: concept.id,
        concept: concept.concept,
        kind: 'suggest_archive',
        detail: `Trust ${after} < 20 → đề xuất archive (không auto-delete).`,
      });
      // Soft-disable very toxic spam/seller only when trust collapses and outcome is spam
      if (input.outcome === 'spam' && after < 10 && concept.enabled) {
        concept.enabled = false;
        await bumpRuleRemoved();
        autoTune.push({
          conceptId: concept.id,
          concept: concept.concept,
          kind: 'auto_disable',
          detail: `Trust ${after} < 10 after spam → disabled concept.`,
        });
      }
    }

    concept.trust = after;
    concept.weight = weight;
    concept.source = 'feedback';
    concept.updatedAt = new Date().toISOString();
    await upsertConcept(concept);

    trustUpdates.push({
      conceptId: concept.id,
      concept: concept.concept,
      category: concept.category,
      trust: after,
      weight,
      delta,
      action,
    });
  }

  if (input.outcome === 'won' && keywords.length) {
    await recordRuleConversion({
      keywords,
      locationLabel: input.campaignKey || null,
      sourceId: input.sourceId || null,
      missionId: input.missionId || null,
    });
  }

  const event = {
    id: `fb_${Date.now()}`,
    outcome: input.outcome,
    keywords,
    conceptIds: matched.map(c => c.id),
    sourceId: input.sourceId || null,
    sourceLabel: input.sourceLabel || null,
    missionId: input.missionId || null,
    missionLabel: input.missionLabel || null,
    campaignKey: input.campaignKey || null,
    contentId: input.contentId || null,
    revenue: typeof input.revenue === 'number' ? input.revenue : 0,
    note: input.note || null,
    at: new Date().toISOString(),
  };
  await appendFeedbackEvent(event);

  return { eventId: event.id, trustUpdates, autoTune };
}

export async function buildFeedbackCenterSnapshot(): Promise<FeedbackCenterSnapshot> {
  const [concepts, state] = await Promise.all([listConcepts(), loadFeedbackState()]);

  const knowledgeEvolution: ConceptTrustRow[] = concepts
    .map(c => ({
      conceptId: c.id,
      concept: c.concept,
      category: c.category,
      trust: typeof c.trust === 'number' ? c.trust : 70,
      weight: c.weight,
      delta: 0,
      action:
        (c.trust ?? 70) < 20
          ? ('suggest_archive' as const)
          : (c.trust ?? 70) > 90
            ? ('increase_weight' as const)
            : ('none' as const),
    }))
    .sort((a, b) => b.trust - a.trust);

  const autoTune = knowledgeEvolution
    .filter(r => r.action !== 'none')
    .map(r => ({
      conceptId: r.conceptId,
      concept: r.concept,
      kind: r.action,
      detail:
        r.action === 'suggest_archive'
          ? `Trust ${r.trust} < 20`
          : `Trust ${r.trust} > 90 — candidate weight boost`,
    }));

  const topConcept = knowledgeEvolution[0]?.concept || null;
  const weekly = computeWeeklySummary(state, topConcept);

  return {
    version: 'h363_feedback_v1',
    weekly,
    ruleEvolution: knowledgeEvolution.slice(0, 40),
    knowledgeEvolution: knowledgeEvolution.slice(0, 40),
    sourceEvolution: Object.values(state.sources).sort((a, b) => b.roiScore - a.roiScore),
    missionEvolution: Object.values(state.missions).sort(
      (a, b) => b.priorityScore - a.priorityScore,
    ),
    contentEvolution: Object.values(state.contents).sort(
      (a, b) => b.contentScore - a.contentScore,
    ),
    campaignEvolution: Object.values(state.campaigns).sort((a, b) => a.rank - b.rank),
    recentEvents: state.events.slice(0, 50),
    autoTune,
  };
}

export function formatWeeklyEvolution(snap: FeedbackCenterSnapshot): string {
  const w = snap.weekly;
  return [
    'Weekly Evolution',
    '',
    'Buyer Accuracy',
    `${w.buyerAccuracy}%`,
    '',
    'Rule Improved',
    String(w.ruleImproved),
    '',
    'Rule Removed',
    String(w.ruleRemoved),
    '',
    'Campaign Improved',
    String(w.campaignImproved),
    '',
    'Top Source',
    w.topSource || '—',
    '',
    'Worst Source',
    w.worstSource || '—',
  ].join('\n');
}
