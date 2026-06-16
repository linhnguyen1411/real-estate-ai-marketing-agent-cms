export type LeadInterestType = 'dat-nen' | 'can-ho' | 'nha-pho' | 'du-an';
export type LeadBudgetRange = 'under-3' | '3-5' | '5-10' | 'over-10';
export type LeadChannel = 'google' | 'facebook' | 'tiktok' | 'google_ads' | 'direct' | 'website' | 'unknown';
export type LeadMagnetSlug =
  | 'bao-cao-nam-da-nang-2026'
  | 'top-20-co-hoi-dau-tu'
  | 'ban-do-dau-tu-nam-da-nang';

export type LeadEventType =
  | 'generate_lead'
  | 'ebook_download'
  | 'phone_click'
  | 'zalo_click'
  | 'messenger_click'
  | 'contact_submit'
  | 'download_report'
  | 'exit_intent_shown'
  | 'popup_shown'
  | 'form_step';

export interface InvestorLead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  interest_type?: LeadInterestType | string;
  budget_range?: LeadBudgetRange | string;
  source?: string;
  channel?: LeadChannel | string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  page_path?: string;
  magnet_slug?: string;
  investor_score: number;
  score_breakdown?: Record<string, number>;
  status: 'new' | 'contacted' | 'qualified' | 'closed' | 'lost';
  tags?: string[];
  access_token?: string;
  emails_sent?: number;
  created_at: string;
  updated_at: string;
}

export interface LeadEvent {
  id: string;
  lead_id?: string;
  session_id?: string;
  event_type: LeadEventType | string;
  event_data?: Record<string, unknown>;
  page_path?: string;
  created_at: string;
}

export interface LeadCapturePayload {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  interest_type?: string;
  budget_range?: string;
  source?: string;
  channel?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  page_path?: string;
  magnet_slug?: string;
  session_id?: string;
  tags?: string[];
  form_type?: 'simple' | 'multi_step' | 'exit_intent' | 'lead_magnet';
  note?: string;
}
