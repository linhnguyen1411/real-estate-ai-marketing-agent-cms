export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: 'facebook' | 'zalo' | 'tiktok' | 'website' | 'referral';
  budget: number; // in VND billions (tỷ)
  interested_area: string;
  property_type: 'đất nền' | 'nhà phố' | 'căn hộ' | 'shophouse' | 'kho xưởng' | 'khác';
  status: 'new' | 'warm' | 'hot' | 'closed' | 'lost';
  notes: string;
  ai_summary: string;
  lead_score: number; // 0 - 100
  created_at: string;
}

export interface Property {
  id: string;
  title: string;
  type: 'đất' | 'nhà phố' | 'căn hộ' | 'shophouse' | 'kho xưởng' | 'nhà hàng';
  location: string;
  area: number; // square meters (m2)
  price: number; // in VND billions (tỷ)
  legal_status: string; // Sổ hồng riêng, HĐMB, Đang chờ sổ
  direction: string; // Đông, Tây, Nam, Bắc, Đông Nam, Tây Nam, Đông Bắc, Tây Bắc
  road_width: number; // meters (m)
  description: string;
  images: string; // Image placeholder URL or string
  selling_points: string[]; // Key selling highligts
  ai_posts?: {
    facebook?: string;
    zalo?: string;
    tiktok?: string;
    website?: string;
    image_prompt?: string;
    video_prompt?: string;
  };
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
  created_by_ai: boolean;
  engagement?: {
    views: number;
    likes: number;
    shares: number;
    comments: number;
  };
  created_at: string;
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
  ai_mode: 'gemini' | 'ollama';
  ollama_endpoint: string;
  ollama_model: string;
  agent_tone: string;
}
