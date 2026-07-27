/**
 * AI Sales Employee — Planning Layer types.
 * Advisory + board generation only; does not touch Runtime / Queue / Fleet / Browser / Publisher cores.
 */

export type CampaignPriority = 'low' | 'medium' | 'high' | 'urgent';
export type CampaignBudgetMode = 'organic' | 'paid' | 'hybrid';

/** Living campaign lifecycle (H2.1 Campaign Runtime) */
export type CampaignLifecycleStatus =
  | 'planning'
  | 'researching'
  | 'mission_planning'
  | 'finding_leads'
  | 'content_drafting'
  | 'waiting_approval'
  | 'publishing'
  | 'monitoring'
  | 'optimizing'
  | 'completed'
  | 'rejected';

export const CAMPAIGN_KANBAN_COLUMNS: CampaignLifecycleStatus[] = [
  'planning',
  'researching',
  'mission_planning',
  'finding_leads',
  'content_drafting',
  'waiting_approval',
  'publishing',
  'monitoring',
  'optimizing',
  'completed',
];

export type CampaignTimelineEvent = {
  at: string;
  phase: CampaignLifecycleStatus | 'system';
  title: string;
  detail?: string;
};

export type CampaignTask = {
  id: string;
  phase: CampaignLifecycleStatus;
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped';
  result?: string;
};

/** H2.0.5 AI Task Orchestrator */
export type OrchestratorTaskStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type OrchestratorAgent =
  | 'research'
  | 'mission'
  | 'content'
  | 'lead'
  | 'publisher'
  | 'monitor'
  | 'recommendation';

export type OrchestratorTask = {
  id: string;
  campaignId: string;
  key: string;
  label: string;
  agent: OrchestratorAgent;
  priority: CampaignPriority;
  status: OrchestratorTaskStatus;
  owner: string;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  retryCount: number;
  dependencies: string[];
  resultSummary?: string | null;
};

export type CampaignProgress = {
  percent: number;
  currentPhase: CampaignLifecycleStatus;
  phasesDone: CampaignLifecycleStatus[];
  blockedReason?: string | null;
};

export type CampaignMetrics = {
  leadTotal: number;
  leadVip: number;
  leadContacted: number;
  leadConverted: number;
  missionsProposed: number;
  contentSlots: number;
  contentApproved: number;
  recommendationsOpen: number;
};

export type CampaignLeadRecord = {
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
  campaignId: string;
  leadStatus: 'new' | 'scored' | 'contacted' | 'assigned' | 'follow_up' | 'converted' | 'closed';
  assignedTo?: string | null;
  followUpAt?: string | null;
};

export type CampaignState = {
  audience: string[];
  budget: CampaignBudgetMode;
  health: number;
  timeline: CampaignTimelineEvent[];
  tasks: CampaignTask[];
  /** H2.0.5 orchestrator graph (source of truth for work coordination) */
  orchestratorTasks: OrchestratorTask[];
  progress: CampaignProgress;
  metrics: CampaignMetrics;
  research: MarketIntelligenceReport | null;
  missions: MissionProposal[];
  content: ContentPlan | null;
  leads: CampaignLeadRecord[];
  recommendations: RecommendationItem[];
  publishProposal: {
    suggestedAt: string;
    channel: string;
    note: string;
    approved: boolean;
  } | null;
  operationalMemory: CampaignTimelineEvent[];
  planChecklist: Array<{ key: string; label: string; done: boolean }>;
  /** ADR-007 — acquisition bridge requests (shape owned by campaign-acquisition) */
  acquisitionRequests?: Array<Record<string, unknown>>;
};

export type LivingCampaign = {
  id: string;
  companyId: string | null;
  name: string;
  goal: string;
  priority: CampaignPriority;
  owner: string | null;
  status: CampaignLifecycleStatus;
  propertyHint: string;
  utterance: string | null;
  state: CampaignState;
  createdAt: string;
  updatedAt: string;
};

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
  /** When backed by Campaign Runtime */
  lifecycleStatus?: CampaignLifecycleStatus;
  livingCampaignId?: string;
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
  competitors: string[];
  priceTrend: string;
  demandTrend: string;
  buyerSignals: string[];
  suggestedPositioning: string;
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
  campaignId?: string | null;
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
    | 'work_status'
    | 'recommendations'
    | 'campaign_approve'
    | 'campaign_reject'
    | 'help';
  board?: CampaignBoard;
  research?: MarketIntelligenceReport;
  missions?: MissionProposal[];
  leads?: LeadCardV2[];
  content?: ContentPlan;
  timeline?: TimelineEntry[];
  recommendations?: RecommendationItem[];
  livingCampaign?: LivingCampaign;
  orchestratorTasks?: OrchestratorTask[];
  lines: string[];
  text: string;
};
