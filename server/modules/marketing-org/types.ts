/**
 * H4 Marketing Organization — funnel brain (Publisher = executor only).
 */

export type MarketingChannel =
  | 'facebook'
  | 'threads'
  | 'instagram'
  | 'tiktok'
  | 'seo'
  | 'landing'
  | 'email'
  | 'zalo_oa'
  | 'linkedin'
  | 'remarketing';

export type CalendarDayTheme =
  | 'research'
  | 'story'
  | 'video'
  | 'review'
  | 'livestream'
  | 'case_study'
  | 'recap';

export type ContentAssetKind =
  | 'post'
  | 'thread'
  | 'reel_script'
  | 'caption'
  | 'seo_article'
  | 'landing_cta'
  | 'email'
  | 'remarketing'
  | 'quote'
  | 'story'
  | 'short_article';

export type ConversationCareLabel = 'reply' | 'buyer' | 'spam' | 'inbox' | 'ignore';

export type FunnelStage =
  | 'research'
  | 'strategy'
  | 'content_production'
  | 'distribution'
  | 'engagement'
  | 'conversation'
  | 'lead_capture'
  | 'buyer_journey'
  | 'conversion'
  | 'learning';

export type ContentVariant = {
  channel: MarketingChannel;
  kind: ContentAssetKind;
  title: string;
  body: string;
  cta?: string | null;
  reuseOf?: string | null;
};

export type ContentPack = {
  id: string;
  seedTopic: string;
  campaignHint: string | null;
  variants: ContentVariant[];
  createdAt: string;
  status: 'draft' | 'ready' | 'distributed';
};

export type CalendarSlot = {
  weekday: number; // 1=Mon … 7=Sun
  theme: CalendarDayTheme;
  label: string;
  channels: MarketingChannel[];
  format: string;
  topicHint: string;
};

export type ContentReusePlan = {
  id: string;
  sourceKind: 'video' | 'article' | 'post';
  sourceTitle: string;
  cuts: ContentVariant[];
  createdAt: string;
};

export type ConversationItem = {
  id: string;
  source: string;
  text: string;
  label: ConversationCareLabel;
  reason: string;
  priority: number;
  at: string;
};

export type TrendItem = {
  id: string;
  topic: string;
  source: 'facebook' | 'threads' | 'tiktok' | 'google_trends' | 'news' | 'findings';
  score: number;
  suggestion: string;
};

export type SeoGapItem = {
  id: string;
  kind: 'keyword' | 'topic_gap' | 'internal_link' | 'landing_gap' | 'competitor_gap';
  title: string;
  detail: string;
  task: string;
};

export type CampaignHealthMetrics = {
  healthScore: number;
  contentProduced: number;
  published: number;
  reused: number;
  comments: number;
  needReply: number;
  buyerConversations: number;
  trendingTopics: number;
  seoGaps: number;
  reach: number;
  engagement: number;
  ctr: number;
  saves: number;
  shares: number;
  traffic: number;
  roiHint: string;
  recommendation: string;
};

export type MarketingLearningState = {
  bestFormats: string[];
  bestHours: string[];
  bestCtas: string[];
  bestCampaigns: string[];
  notes: string[];
  updatedAt: string;
};

export type MarketingOrgSnapshot = {
  version: 'h4_v1';
  funnel: FunnelStage[];
  packs: ContentPack[];
  calendar: CalendarSlot[];
  reusePlans: ContentReusePlan[];
  conversationQueue: ConversationItem[];
  trends: TrendItem[];
  seoGaps: SeoGapItem[];
  health: CampaignHealthMetrics;
  learning: MarketingLearningState;
  updatedAt: string;
};

export const ALL_CHANNELS: MarketingChannel[] = [
  'facebook',
  'threads',
  'instagram',
  'tiktok',
  'seo',
  'landing',
  'email',
  'zalo_oa',
  'linkedin',
  'remarketing',
];

export const FUNNEL_STAGES: FunnelStage[] = [
  'research',
  'strategy',
  'content_production',
  'distribution',
  'engagement',
  'conversation',
  'lead_capture',
  'buyer_journey',
  'conversion',
  'learning',
];
