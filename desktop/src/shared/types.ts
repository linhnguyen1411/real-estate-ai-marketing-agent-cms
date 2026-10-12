/**
 * Shared types between Main, Preload, and Renderer for Desktop Agent App.
 */

export type PostClassification = 'SUPPLY' | 'DEMAND' | 'UNKNOWN';

export interface ExtractedLeadData {
  id: string;
  sourceType: 'facebook' | 'zalo';
  sourceName: string;
  sourceUrl?: string;
  authorName?: string;
  authorPhone?: string;
  rawText: string;
  classification: PostClassification;
  intentScore: number;
  isHotLead: boolean;
  askingPrice?: string;
  locationArea?: string;
  projectBlock?: string;
  timestamp: number;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface ZaloIncomingMessage {
  groupName: string;
  senderName: string;
  senderPhone?: string;
  content: string;
  timestamp: string;
}

export interface FacebookIncomingPost {
  externalId?: string;
  groupName?: string;
  authorName?: string;
  contentText: string;
  canonicalUrl?: string;
  timestamp: number;
}

export interface AgentSourceItem {
  id: string;
  companyId?: string | null;
  name: string;
  type: string;
  url: string;
  status: string;
}

export type ScanSpeedMode = 'turbo' | 'fast' | 'standard';

export type ActiveTab = 'dashboard' | 'facebook' | 'zalo' | 'publisher' | 'settings';

export interface DesktopAgentStats {
  facebookPostsTotal: number;
  zaloMessagesTotal: number;
  hotLeadsTotal: number;
  syncedToVpsTotal: number;
  debuggerAttached: boolean;
  chromeCdpAttached: boolean;
  vpsConnected: boolean;
  activeTab: ActiveTab;
  activeSourcesTotal: number;
  currentSourceIndex: number;
  currentSourceName: string;
  currentSourceUrl: string;
  autoRotateSources: boolean;
  secondsUntilNextRotate: number;
  scanSpeedMode: ScanSpeedMode;
}

export interface DesktopAgentSettings {
  vpsUrl: string;
  vpsApiKeyId: string;
  vpsApiSecret: string;
  autoSyncEnabled: boolean;
  minHotLeadScore: number;
  soundNotification: boolean;
  autoScrollFacebook: boolean;
  autoScrollIntervalSec: number;
  cdpPort: number;
  cdpProfileDir: string;
  cdpAutoLaunch: boolean;
  autoRotateSources: boolean;
  rotateIntervalMinutes: number;
  rotateIntervalSec?: number;
  scanSpeedMode?: ScanSpeedMode;
}

export interface InventoryProperty {
  id: string;
  title: string;
  type: string;
  transaction_type?: string;
  location: string;
  area: number;
  price: number;
  legal_status?: string;
  direction?: string;
  road_width?: number;
  bedrooms?: number;
  bathrooms?: number;
  description?: string;
  selling_points?: string[];
  project_name?: string;
  block?: string;
  lot?: string;
  sale_status?: string;
  images?: string;
  gallery_images?: string[];
  created_at?: string;
}

export type PublishStatus = 'idle' | 'pending' | 'posting' | 'success' | 'failed';

export interface PublishQueueItem {
  id: string;
  groupId: string;
  groupName: string;
  groupUrl: string;
  status: PublishStatus;
  message?: string;
  postedAt?: number;
}

export interface PublishSessionConfig {
  propertyId: string;
  propertyTitle: string;
  postContent: string;
  groups: AgentSourceItem[];
  intervalSeconds: number;
  mode: 'auto' | 'review';
}

export interface GeneratePostRequest {
  propertyId?: string;
  propertyData?: Partial<InventoryProperty>;
  tone?: string;
}

