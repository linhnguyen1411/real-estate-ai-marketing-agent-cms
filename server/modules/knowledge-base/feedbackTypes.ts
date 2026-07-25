/**
 * H3.6.3 — Continuous Learning & Feedback Loop types
 * Measure + evolve from real outcomes. Does not touch Scanner / Sales Layer / Runtime.
 */

export type FeedbackOutcome =
  | 'won'
  | 'lost'
  | 'spam'
  | 'buyer'
  | 'qualified'
  | 'discarded';

export type FeedbackEvent = {
  id: string;
  outcome: FeedbackOutcome;
  keywords: string[];
  conceptIds: string[];
  sourceId: string | null;
  sourceLabel: string | null;
  missionId: string | null;
  missionLabel: string | null;
  campaignKey: string | null;
  contentId: string | null;
  revenue: number;
  note: string | null;
  at: string;
};

export type ConceptTrustRow = {
  conceptId: string;
  concept: string;
  category: string;
  trust: number;
  weight: number;
  delta: number;
  action: 'none' | 'increase_weight' | 'suggest_archive' | 'boost' | 'penalize';
};

export type SourceEvolution = {
  sourceId: string;
  label: string;
  buyers: number;
  spam: number;
  won: number;
  roiScore: number;
  /** Suggestion only — does not mutate Scanner */
  suggestedFrequency: 'increase' | 'decrease' | 'hold';
  frequencyMultiplier: number;
};

export type MissionEvolution = {
  missionId: string;
  label: string;
  buyers: number;
  emptyRuns: number;
  priorityScore: number;
  suggestedPriority: 'increase' | 'decrease' | 'hold';
};

export type ContentEvolution = {
  contentId: string;
  label: string;
  leads: number;
  buyers: number;
  won: number;
  contentScore: number;
};

export type CampaignEvolution = {
  campaignKey: string;
  label: string;
  pipeline: number;
  won: number;
  revenue: number;
  roi: number;
  rank: number;
};

export type WeeklyEvolutionSummary = {
  buyerAccuracy: number;
  ruleImproved: number;
  ruleRemoved: number;
  campaignImproved: number;
  topSource: string | null;
  worstSource: string | null;
  topConcept: string | null;
  eventsThisWeek: number;
  updatedAt: string;
};

export type FeedbackCenterSnapshot = {
  version: 'h363_feedback_v1';
  weekly: WeeklyEvolutionSummary;
  ruleEvolution: ConceptTrustRow[];
  knowledgeEvolution: ConceptTrustRow[];
  sourceEvolution: SourceEvolution[];
  missionEvolution: MissionEvolution[];
  contentEvolution: ContentEvolution[];
  campaignEvolution: CampaignEvolution[];
  recentEvents: FeedbackEvent[];
  autoTune: Array<{ conceptId: string; concept: string; kind: string; detail: string }>;
};
