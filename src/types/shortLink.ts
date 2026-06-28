export type ShortLinkEntityType = 'property' | 'blog_post' | 'landing' | 'lead_magnet' | 'custom';

export interface ShortLink {
  id: string;
  slug: string;
  target_url: string;
  title?: string;
  description?: string;
  entity_type?: ShortLinkEntityType | string;
  entity_id?: string;
  campaign?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  is_active: boolean;
  expires_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  click_count?: number;
  short_url?: string;
}

export interface ShortLinkClick {
  id: string;
  short_link_id: string;
  device?: string;
  browser?: string;
  os?: string;
  referer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  clicked_at: string;
}

export interface ShortLinkAnalytics {
  total_clicks: number;
  unique_devices: number;
  by_device: Record<string, number>;
  by_browser: Record<string, number>;
  by_referer: Record<string, number>;
  recent_clicks: ShortLinkClick[];
}

export interface ShortLinkInput {
  slug?: string;
  target_url: string;
  title?: string;
  description?: string;
  entity_type?: ShortLinkEntityType | string;
  entity_id?: string;
  campaign?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  is_active?: boolean;
  expires_at?: string;
}
