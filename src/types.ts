export type UserRole = 'owner' | 'company' | 'member';
export type AgentTier = 'legendary' | 'diamond' | 'gold' | 'silver' | 'bronze' | 'normal';

export interface Company {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  company_id?: string;
  phone?: string;
  avatar_url?: string;
  bio?: string;
  agent_tier?: AgentTier;
  public_slug?: string;
  show_public_profile?: boolean;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  company_id?: string;
  company_name?: string;
  phone?: string;
  avatar_url?: string;
  bio?: string;
  agent_tier?: AgentTier;
  public_slug?: string;
  show_public_profile?: boolean;
}

export interface PublicAgentProfile {
  id: string;
  name: string;
  phone?: string;
  avatar_url?: string;
  bio?: string;
  agent_tier: AgentTier;
  public_slug: string;
  company_name?: string;
  property_count: number;
  profile_url: string;
}

export interface AccessControlledResource {
  company_id?: string;
  owner_user_id?: string;
  assigned_member_ids?: string[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: 'facebook' | 'zalo' | 'tiktok' | 'website' | 'referral';
  budget: number; // in VND billions (tỷ)
  interested_area: string;
  property_type: 'Đất nền' | 'Nhà Phố' | 'Căn Hộ' | 'Shophouse' | 'Kho xưởng' | 'Nhà hàng' | 'Khách sạn' | 'Biệt thự' | 'Villa' | 'Khác';
  status: 'new' | 'warm' | 'hot' | 'closed' | 'lost';
  notes: string;
  ai_summary: string;
  lead_score: number; // 0 - 100
  created_at: string;
  company_id?: string;
  owner_user_id?: string;
  assigned_member_ids?: string[];
}

export interface Property {
  id: string;
  title: string;
  type: 'Đất nền' | 'Nhà Phố' | 'Căn Hộ' | 'Shophouse' | 'Kho xưởng' | 'Nhà hàng' | 'Khách sạn' | 'Biệt thự' | 'Villa' | 'Khác';
  transaction_type?: 'Bán' | 'Cho thuê';
  location: string;
  area: number; // square meters (m2)
  floor_area?: number; // gross floor area (m2)
  price: number; // in VND billions (tỷ)
  legal_status: string; // Sổ hồng riêng, HĐMB, Đang chờ sổ
  direction: string; // Đông, Tây, Nam, Bắc, Đông Nam, Tây Nam, Đông Bắc, Tây Bắc
  road_width: number; // meters (m)
  floors?: number;
  bedrooms?: number;
  bathrooms?: number;
  garage?: boolean;
  pool?: boolean;
  description: string;
  rich_description?: string;
  internal_notes?: string;
  sale_status?: 'available' | 'sold' | 'hidden';
  is_featured?: boolean;
  public_view_count?: number;
  last_public_view_at?: string;
  images: string; // Image placeholder URL or string
  gallery_images?: string[];
  map_latitude?: number;
  map_longitude?: number;
  selling_points: string[]; // Key selling highligts
  project_name?: string;
  market_zone?: string;
  ai_posts?: {
    strategy?: {
      target_customer: string;
      customer_insight: string;
      campaign_angle: string;
      creative_concept: string;
      key_message: string;
    };
    image_prompts?: {
      facebook: string;
      zalo: string;
      tiktok: string;
    };
    seo?: {
      title: string;
      meta_description: string;
      keywords: string[];
      hashtags: string[];
    };
    facebook?: string;
    zalo?: string;
    tiktok?: string;
    website?: string;
    image_prompt?: string;
    video_prompt?: string;
  };
  company_id?: string;
  owner_user_id?: string;
  created_by_user_id?: string;
  assigned_member_ids?: string[];
  created_at?: string;
}

export interface Post {
  id: string;
  title: string;
  platform: 'facebook' | 'zalo' | 'tiktok' | 'website';
  content: string;
  status: 'draft' | 'scheduled' | 'published';
  scheduled_at?: string;
  property_id?: string;
  property_title?: string;
  seo_title?: string;
  meta_description?: string;
  keywords?: string[];
  hashtags?: string[];
  created_by_ai: boolean;
  engagement?: {
    views: number;
    likes: number;
    shares: number;
    comments: number;
  };
  created_at: string;
  company_id?: string;
  owner_user_id?: string;
  assigned_member_ids?: string[];
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  hubPath: string;
  legacyHubPath?: string | null;
  sortOrder?: number;
  postCount?: number;
}

export interface BlogInternalLink {
  id?: string;
  label: string;
  href: string;
  sortOrder?: number;
  isAuto?: boolean;
}

export interface SeoAuditReport {
  passed: boolean;
  score: number;
  checks: { id: string; label: string; passed: boolean; severity: string; message: string }[];
  warnings: string[];
  errors: string[];
  wordCount: number;
}

export interface DuplicateCheckReport {
  passed: boolean;
  blockers: string[];
  warnings: string[];
}

export interface BlogAuthor {
  id: string;
  name: string;
  slug: string;
}

export interface BlogTag {
  id: string;
  name: string;
  slug: string;
}

export interface BlogFaq {
  id?: string;
  question: string;
  answer: string;
  sortOrder?: number;
}

export interface BlogArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content?: string;
  contentMarkdown?: string;
  contentHtml?: string | null;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl?: string | null;
  coverImage?: string | null;
  status: 'draft' | 'review' | 'published' | 'archived';
  categoryId: string;
  authorId: string;
  publishedAt?: string | null;
  readingTime?: number | null;
  wordCount?: number | null;
  seoScore?: number | null;
  contentQualityScore?: number | null;
  sourceType?: string;
  primaryKeyword?: string | null;
  secondaryKeywords?: string[] | null;
  targetIntent?: string | null;
  cluster?: string | null;
  articleType?: string | null;
  isPillar?: boolean;
  isIndexable?: boolean;
  relatedSuggestions?: string[];
  relatedPostIds?: string[];
  createdAt: string;
  updatedAt: string;
  category?: BlogCategory;
  author?: BlogAuthor;
  tags?: BlogTag[];
  faqs?: BlogFaq[];
  internalLinks?: BlogInternalLink[];
}

export interface InboxMessage {
  id: string;
  sender_name: string;
  platform: 'facebook' | 'zalo' | 'tiktok' | 'website';
  avatar?: string;
  message: string;
  intent?: 'hỏi giá' | 'hỏi vị trí' | 'thương lượng' | 'đặt lịch xem' | 'không tiềm năng' | 'chưa rõ';
  status: 'pending' | 'replied' | 'ignored';
  customer_id?: string;
  ai_reply_suggestion?: string;
  created_at: string;
  company_id?: string;
  owner_user_id?: string;
  assigned_member_ids?: string[];
}

export interface AutomationTask {
  id: string;
  name: string;
  trigger_event: string;
  action_description: string;
  status: 'active' | 'inactive';
  last_run?: string;
  run_count: number;
  logs: string[];
  company_id?: string;
  owner_user_id?: string;
  assigned_member_ids?: string[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface MarketingChannel {
  name: string;
  platform: 'facebook' | 'zalo' | 'tiktok' | 'website';
  connected: boolean;
  last_sync: string;
  messages_count: number;
  comments_count: number;
  metrics: {
    followers: number;
    reach: number;
    conversions: number;
  };
}

export interface ProjectCatalogGroup {
  zone: string;
  label: string;
  projects: string[];
}

export interface AppSettings {
  ai_mode: 'auto' | 'ollama' | 'openai' | 'gemini';
  ollama_endpoint: string;
  ollama_model: string;
  openai_model: string;
  agent_tone: string;
  site_view_count?: number;
  last_site_view_at?: string;
  seo_keywords?: string[];
  /** Thứ tự thẻ dự án trên trang BĐS công khai */
  project_display_order?: string[];
  /** Danh mục dự án tùy chỉnh (ghi đè PROPERTY_PROJECT_GROUPS khi có) */
  project_groups?: ProjectCatalogGroup[];
  /** Telegram lead alerts */
  telegram_enabled?: boolean;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  telegram_min_score?: number;
  telegram_classifications?: string[];
  telegram_only_with_phone?: boolean;
  telegram_include_phone?: boolean;
  telegram_include_budget?: boolean;
  telegram_include_location?: boolean;
  telegram_include_link?: boolean;
  telegram_quiet_hours_start?: string;
  telegram_quiet_hours_end?: string;
  /** Control Plane Telegram Console */
  telegram_console_enabled?: boolean;
  telegram_console_mode?: 'polling' | 'webhook';
  telegram_allowed_user_ids?: string;
  telegram_allowed_chat_ids?: string;
  telegram_admin_user_ids?: string;
  telegram_webhook_secret?: string;
  /** AI Agent → VPS sync */
  agent_sync_enabled?: boolean;
  agent_sync_vps_url?: string;
  agent_sync_key_id?: string;
  agent_sync_secret?: string;
  agent_sync_company_id?: string;
  agent_sync_worker_id?: string;
  agent_sync_batch_size?: number;
  agent_sync_timeout_ms?: number;
  agent_sync_verify_tls?: boolean;
}

export interface ChatHistoryRecord {
  id: string;
  user_id: string;
  company_id?: string;
  role: 'user' | 'model';
  message: string;
  created_at: string;
}

export interface PublicChatGuest {
  session_id: string;
  name: string;
  phone: string;
  customer_id?: string;
  ai_enabled: 0 | 1 | boolean;
  created_at: string;
  updated_at: string;
  last_message?: string;
  last_message_at?: string;
  message_count?: number;
}

export interface GeneratedContentRecord {
  id: string;
  company_id?: string;
  user_id?: string;
  property_id?: string;
  property_title?: string;
  channel: 'facebook' | 'zalo' | 'tiktok' | 'website' | 'image_prompt' | 'video_prompt';
  raw_content: string;
  verified_content?: string;
  status: 'raw' | 'verified';
  created_at: string;
  verified_at?: string;
}
