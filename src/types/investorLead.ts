export type LeadInterestType = 'dat-nen' | 'can-ho' | 'nha-pho' | 'du-an';
export type LeadBudgetRange = 'under-3' | '3-5' | '5-10' | 'over-10';
export type LeadChannel = 'google' | 'facebook' | 'tiktok' | 'google_ads' | 'direct' | 'website' | 'unknown';
export type LeadMagnetSlug =
  | 'bao-cao-nam-da-nang-2026'
  | 'top-20-co-hoi-dau-tu';

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
  | 'form_step'
  | 'short_link_click'
  | 'property_share_open'
  | 'property_share_copy'
  | 'property_share_facebook'
  | 'property_share_zalo'
  | 'property_share_tiktok'
  | 'qr_view'
  | 'qr_download';

/** Structured payload stored on agent_promote events / returned for detail view */
export interface InvestorLeadPromoteDetail {
  findingId?: string;
  classification?: string | null;
  intent?: string | null;
  actorRole?: string | null;
  priority?: string | null;
  urgency?: string | null;
  leadScore?: number | null;
  scoreStatus?: string | null;
  title?: string | null;
  summary?: string | null;
  needSummary?: string | null;
  recommendedAction?: string | null;
  replySuggestion?: string | null;
  reasons?: string[];
  missingInformation?: string[];
  risks?: string[];
  personName?: string | null;
  facebookName?: string | null;
  facebookProfileUrl?: string | null;
  phones?: string[];
  primaryPhone?: string | null;
  emails?: string[];
  zalo?: string | null;
  budgetRange?: string | null;
  buyerBudgetMin?: number | null;
  buyerBudgetMax?: number | null;
  purpose?: string | null;
  transactionTimeline?: string | null;
  location?: string | null;
  city?: string | null;
  district?: string | null;
  ward?: string | null;
  street?: string | null;
  project?: string | null;
  propertyTypes?: string[];
  areaMinM2?: number | null;
  areaMaxM2?: number | null;
  bedrooms?: number | null;
  floors?: number | null;
  legalStatus?: string | null;
  direction?: string | null;
  features?: string[];
  requirements?: string[];
  sourcePostUrl?: string | null;
  sourceGroup?: string | null;
  sourceName?: string | null;
  sourceType?: string | null;
  authorName?: string | null;
  authorUrl?: string | null;
  publishedAt?: string | null;
  collectedAt?: string | null;
  originalContent?: string | null;
  shortDescription?: string | null;
  [key: string]: unknown;
}

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
  source_channel?: string;
  source_type?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  page_path?: string;
  magnet_slug?: string;
  short_link_slug?: string;
  first_message?: string;
  investor_score: number;
  score_breakdown?: Record<string, number>;
  status:
    | 'new'
    | 'contacted'
    | 'qualified'
    | 'closed'
    | 'lost'
    | 'called'
    | 'unreachable'
    | 'callback_scheduled'
    | 'unqualified'
    | 'converted_to_customer'
    | string;
  tags?: string[];
  access_token?: string;
  emails_sent?: number;
  /** Latest agent_promote event payload (Lead Intelligence) */
  promote_detail?: InvestorLeadPromoteDetail | null;
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
  short_link_slug?: string;
  session_id?: string;
  tags?: string[];
  form_type?: 'simple' | 'multi_step' | 'exit_intent' | 'lead_magnet';
  note?: string;
}
