/**
 * H3.5 Sales Layer — Buyer Journey + Sales Pipeline types.
 * Lead = start; Closed = goal. Persisted on finding.extractedData.salesLayer.
 */

export type BuyerJourneyStage =
  | 'detected'
  | 'researching'
  | 'comparing'
  | 'interested'
  | 'contacted'
  | 'appointment'
  | 'negotiating'
  | 'closed_won'
  | 'closed_lost';

export type SalesPipelineStage =
  | 'detected'
  | 'qualified'
  | 'assigned'
  | 'contacted'
  | 'appointment'
  | 'negotiating'
  | 'won'
  | 'lost';

export type BuyerSignalKind =
  | 'comment'
  | 'post'
  | 'mention'
  | 'search'
  | 'website'
  | 'messenger'
  | 'inbox'
  | 'crm'
  | 'call'
  | 'reaction'
  | 'form'
  | 'other';

export type BuyerSignal = {
  id: string;
  kind: BuyerSignalKind;
  at: string;
  findingId?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  summary?: string | null;
  weight: number;
};

export type LeadTimelineEvent = {
  at: string;
  kind: string;
  label: string;
  detail?: string | null;
  actor?: string | null;
};

export type StageHistoryEntry = {
  at: string;
  from: SalesPipelineStage | BuyerJourneyStage | null;
  to: SalesPipelineStage | BuyerJourneyStage;
  reason?: string | null;
  actor?: string | null;
};

export type SalesRecommendation = {
  code: 'call_now' | 'send_quote' | 'reply_comment' | 'follow_up' | 'remarket' | 'monitor' | 'assign';
  label: string;
  reason: string;
  urgency: 'urgent' | 'soon' | 'normal' | 'low';
};

export type FollowUpFlag = {
  needsFollowUp: boolean;
  coolingHours: number;
  reason: string | null;
  suggestion: string | null;
};

export type SalesLayerProfile = {
  version: 'h35_v1';
  findingId: string;
  buyerKey: string;
  canonicalFindingId: string;
  mergedFindingIds: string[];
  journeyStage: BuyerJourneyStage;
  pipelineStage: SalesPipelineStage;
  signals: BuyerSignal[];
  timeline: LeadTimelineEvent[];
  stageHistory: StageHistoryEntry[];
  owner: string | null;
  expectedCloseAt: string | null;
  probability: number;
  expectedDealTy: number | null;
  recommendation: SalesRecommendation;
  followUp: FollowUpFlag;
  learningAdjust?: {
    intentBoost: number;
    scoreBoost: number;
    priorityBoost: number;
    campaignBoost: number;
    outcomes: string[];
  } | null;
  updatedAt: string;
};

export type PipelineValueMetrics = {
  detected: number;
  qualified: number;
  assigned: number;
  contacted: number;
  appointment: number;
  negotiating: number;
  won: number;
  lost: number;
  pipelineValueTy: number;
  estimatedRevenueTy: number;
  expectedRevenueTy: number;
  averageDealSizeTy: number;
  winRate: number;
  averageDays: number;
  needFollowUp: number;
  urgentBuyers: number;
  byCampaign: Array<{
    campaignId: string;
    name: string;
    leads: number;
    qualified: number;
    negotiating: number;
    closed: number;
    pipelineValueTy: number;
    expectedRevenueTy: number;
  }>;
  bySource: Array<{
    sourceId: string;
    name: string;
    leads: number;
    won: number;
    pipelineValueTy: number;
  }>;
};

export const JOURNEY_STAGES: BuyerJourneyStage[] = [
  'detected',
  'researching',
  'comparing',
  'interested',
  'contacted',
  'appointment',
  'negotiating',
  'closed_won',
  'closed_lost',
];

export const SALES_PIPELINE_STAGES: SalesPipelineStage[] = [
  'detected',
  'qualified',
  'assigned',
  'contacted',
  'appointment',
  'negotiating',
  'won',
  'lost',
];

export const JOURNEY_RANK: Record<BuyerJourneyStage, number> = {
  detected: 0,
  researching: 1,
  comparing: 2,
  interested: 3,
  contacted: 4,
  appointment: 5,
  negotiating: 6,
  closed_won: 7,
  closed_lost: 7,
};

export const PIPELINE_RANK: Record<SalesPipelineStage, number> = {
  detected: 0,
  qualified: 1,
  assigned: 2,
  contacted: 3,
  appointment: 4,
  negotiating: 5,
  won: 6,
  lost: 6,
};

export const STAGE_PROBABILITY: Record<SalesPipelineStage, number> = {
  detected: 0.08,
  qualified: 0.18,
  assigned: 0.25,
  contacted: 0.35,
  appointment: 0.5,
  negotiating: 0.65,
  won: 1,
  lost: 0,
};
