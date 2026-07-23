/**
 * AI Sales Employee — Planning Layer types.
 * Advisory + board generation only; does not touch Runtime / Queue / Fleet / Browser / Publisher cores.
 */

export type CampaignPriority = 'low' | 'medium' | 'high' | 'urgent';
export type CampaignBudgetMode = 'organic' | 'paid' | 'hybrid';

export type CampaignBoard = {
  id: string;
  name: string;
  goal: string;
  audience: string[];
  budget: CampaignBudgetMode;
  priority: CampaignPriority;
  propertyHint: string;
  planChecklist: Array<{ key: string; label: string; done: boolean }>;
  tasks: string[];
  health: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type MarketIntelligenceReport = {
  id: string;
  title: string;
  propertyHint: string;
  avgPricePerSqm: number | null;
  minPricePerSqm: number | null;
  maxPricePerSqm: number | null;
  priceUnit: string;
  sources: string[];
  topSimilarPosts: Array<{ title: string; source: string; signal: string }>;
  topBrokers: string[];
  topKeywords: string[];
  trends: string[];
  summary: string;
  createdAt: string;
};

export type MissionProposal = {
  id: string;
  name: string;
  persona: string;
  areaHint: string;
  intent: string;
  priority: CampaignPriority;
  suggestedTemplateKey: string;
};

export type LeadCardV2 = {
  rank: number;
  confidence: number;
  name: string;
  budget: string;
  need: string;
  area: string;
  timeline: string;
  intent: string;
  mission: string;
  reason: string[];
  recommendation: string;
  suggestedReply: string;
  priority: CampaignPriority;
  findingId?: string | null;
};

export type ContentScheduleItem = {
  time: string;
  channel: string;
  format: string;
  topic: string;
};

export type ContentPlan = {
  id: string;
  campaignName: string;
  channels: string[];
  schedule: ContentScheduleItem[];
  createdAt: string;
};

export type RecommendationItem = {
  id: string;
  campaignName: string;
  severity: 'info' | 'warn' | 'critical';
  message: string;
  actionLabel: string;
  command?: string | null;
};

export type TimelineEntry = {
  at: string;
  kind: string;
  title: string;
  detail?: string;
};

export type SalesEmployeeResult = {
  mode:
    | 'campaign_board'
    | 'research_report'
    | 'mission_proposals'
    | 'lead_cards'
    | 'content_plan'
    | 'timeline'
    | 'recommendations'
    | 'help';
  board?: CampaignBoard;
  research?: MarketIntelligenceReport;
  missions?: MissionProposal[];
  leads?: LeadCardV2[];
  content?: ContentPlan;
  timeline?: TimelineEntry[];
  recommendations?: RecommendationItem[];
  lines: string[];
  text: string;
};
