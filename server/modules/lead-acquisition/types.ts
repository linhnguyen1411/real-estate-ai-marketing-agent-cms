/**
 * H3 Lead Acquisition Engine — types.
 * Scanner = input; Buyer Lead = output. No Gemini dependency for core path.
 */

export type BuyerIntentLabel =
  | 'buyer'
  | 'potential_buyer'
  | 'warm_lead'
  | 'research_phase'
  | 'ready_buyer'
  | 'investor'
  | 'renter'
  | 'unknown'
  | 'non_buyer';

export type BuyerPersona =
  | 'investor'
  | 'home_buyer'
  | 'upgrader'
  | 'first_home'
  | 'business'
  | 'hotel'
  | 'apartment'
  | 'land'
  | 'rental'
  | 'developer'
  | 'unknown';

export type BuyingTimeline =
  | 'buying_today'
  | 'within_7_days'
  | 'within_30_days'
  | 'researching'
  | 'long_term'
  | 'unknown';

export type LeadPipelineStage =
  | 'candidate'
  | 'qualified'
  | 'assigned'
  | 'contacted'
  | 'interested'
  | 'negotiating'
  | 'won'
  | 'lost';

export type LeadActionSuggestion =
  | 'call'
  | 'inbox'
  | 'comment'
  | 'ignore'
  | 'monitor'
  | 'assign'
  | 'crm';

export type LearningOutcome = 'won' | 'lost' | 'spam' | 'wrong';

export type IntentDetectionResult = {
  intent: BuyerIntentLabel;
  confidence: number;
  matchedPatterns: string[];
  reasons: string[];
};

export type PersonaResult = {
  persona: BuyerPersona;
  confidence: number;
  reasons: string[];
};

export type CampaignMatchResult = {
  campaignId: string | null;
  campaignName: string | null;
  propertyHint: string | null;
  matchScore: number;
  reasons: string[];
};

export type PriorityBreakdown = {
  urgency: number;
  budget: number;
  areaMatch: number;
  campaignMatch: number;
  activity: number;
  buyingTimeline: number;
  engagement: number;
  aiConfidence: number;
  finalScore: number;
};

export type ActionRecommendation = {
  action: LeadActionSuggestion;
  label: string;
  reason: string;
};

export type LeadAcquisitionProfile = {
  version: 'h3_v1';
  findingId: string;
  pipelineStage: LeadPipelineStage;
  intent: IntentDetectionResult;
  persona: PersonaResult;
  timeline: BuyingTimeline;
  campaignMatch: CampaignMatchResult;
  priority: PriorityBreakdown;
  action: ActionRecommendation;
  isBuyer: boolean;
  isVip: boolean;
  learningOutcome?: LearningOutcome | null;
  updatedAt: string;
};

export type LeadAcquisitionMetrics = {
  buyerCandidates: number;
  qualifiedBuyers: number;
  vipBuyers: number;
  assigned: number;
  converted: number;
  contacted: number;
  lost: number;
  byCampaign: Array<{ campaignId: string; name: string; leads: number; vip: number }>;
  bySource: Array<{ sourceId: string; name: string; leads: number }>;
};
