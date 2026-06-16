export type UserRole = 'owner' | 'company' | 'member';

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
  source: 'facebook' | 'zalo' | 'tiktok' | 'website' | 'referral' | 'crawler' | 'extension' | 'manual_import' | 'facebook-feed-auto';
  budget: number; // in VND billions (tỷ)
  interested_area: string;
  property_type: 'Đất nền' | 'Nhà Phố' | 'Căn Hộ' | 'Shophouse' | 'Kho xưởng' | 'Nhà hàng' | 'Khách sạn' | 'Biệt thự' | 'Villa' | 'Khác';
  status: 'new' | 'warm' | 'hot' | 'closed' | 'lost';
  notes: string;
  ai_summary: string;
  lead_score: number; // 0 - 100
  phones?: string[];
  possible_phones?: string[];
  confidence_score?: number;
  source_url?: string;
  demand_type?: LeadIntent;
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
  assigned_member_ids?: string[];
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

export interface AppSettings {
  ai_mode: 'auto' | 'ollama' | 'openai' | 'gemini';
  ollama_endpoint: string;
  ollama_model: string;
  openai_model: string;
  agent_tone: string;
  site_view_count?: number;
  last_site_view_at?: string;
  seo_keywords?: string[];
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

export type CrawlerJobStatus = 'active' | 'paused' | 'disabled';
export type LeadIntent = 'buy' | 'sell' | 'rent' | 'lease' | 'unknown';

export interface CrawlerJob {
  id: string;
  source_name: string;
  start_url: string;
  keyword: string;
  run_interval_minutes: number;
  status: CrawlerJobStatus;
  company_id?: string;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CrawlerResult {
  id: string;
  job_id: string;
  source_name: string;
  title: string;
  text: string;
  phone?: string;
  source_url: string;
  intent: LeadIntent;
  lead_id?: string;
  company_id?: string;
  created_at: string;
}

export interface CrawlerLog {
  id: string;
  job_id: string;
  pages_scanned: number;
  new_leads: number;
  duplicates: number;
  errors: string[];
  message: string;
  created_at: string;
}

export interface CrawlerRunSummary {
  job_id: string;
  pages_scanned: number;
  new_leads: number;
  duplicates: number;
  errors: string[];
  message: string;
}

export interface CrawlerTestPreview {
  job_id: string;
  source_url: string;
  title: string;
  text: string;
  phone?: string;
  intent: LeadIntent;
  would_save: boolean;
  dry_run: true;
  errors: string[];
}

export interface CrawlerHealthBlockedJob {
  job_id: string;
  source_name: string;
  block_count: number;
  last_error?: string;
}

export interface CrawlerHealthData {
  active_jobs: number;
  total_jobs: number;
  last_run_at?: string;
  new_leads_today: number;
  errors_today: number;
  blocked_jobs: CrawlerHealthBlockedJob[];
}

export interface LeadExtractResult {
  title: string;
  url: string;
  raw_content: string;
  selected_text: string;
  phone: string;
  phones: string[];
  possible_phones: string[];
  raw_phone_matches?: string[];
  confidence_score?: number;
  demand_type: LeadIntent;
  property_type: Customer['property_type'];
  location: string;
  budget: number;
  ai_summary: string;
  lead_score: number;
  name: string;
}

export interface LeadSaveResult {
  saved: boolean;
  duplicate: boolean;
  reason?: 'phone' | 'source_url';
  customer?: Customer;
  message?: string;
}

export interface AutoCollectStats {
  total_posts_scanned: number;
  total_leads_found: number;
  total_new_leads: number;
  total_duplicates: number;
  conversion_rate: number;
  sessions_count: number;
  last_session_at?: string;
}

export interface BatchExtractResult {
  processed: number;
  newLeads: number;
  duplicates: number;
  leads_found: number;
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
