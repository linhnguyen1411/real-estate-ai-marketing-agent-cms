import type { LucideIcon } from 'lucide-react';

export type AdminTabId = string;

export type NavBadgeKey =
  | 'crm'
  | 'properties'
  | 'posts'
  | 'pendingInbox'
  | 'investorLeads'
  | 'leadIntelligence'
  | 'externalInventory'
  | 'notifications'
  | 'jobs'
  | 'sources'
  | 'websiteChat'
  | 'chatHistory'
  | 'users';

export interface NavItemConfig {
  id: AdminTabId;
  label: string;
  icon: LucideIcon;
  /** Navigate path; default `/admin/dashboard` for tab-only modules */
  path?: string;
  badgeKey?: NavBadgeKey;
  /** Role gate: only owner/company */
  requireCompanyAdmin?: boolean;
  featureFlag?: 'mxh_posts' | 'website_chat';
  children?: NavItemConfig[];
}

export interface NavigationCountsView {
  crm: number;
  properties: number;
  posts: number;
  pendingInbox: number;
  leadIntelligence: number;
  investorLeads: number;
  externalInventory: number;
  notifications: number;
  jobs: number;
  sources: number;
}
