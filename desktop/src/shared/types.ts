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

export interface DesktopAgentStats {
  facebookPostsTotal: number;
  zaloMessagesTotal: number;
  hotLeadsTotal: number;
  syncedToVpsTotal: number;
  debuggerAttached: boolean;
  chromeCdpAttached: boolean;
  vpsConnected: boolean;
  activeTab: 'dashboard' | 'facebook' | 'zalo' | 'settings';
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
