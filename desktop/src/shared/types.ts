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

export type AgentRoleKey = 'super_admin' | 'team_lead' | 'member' | 'independent' | 'pending_member';

export type AgentDataScope = 'all' | 'team' | 'own' | 'none';

export interface DesktopUserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  roleKey: AgentRoleKey;
  roleLabel: string;
  companyId: string | null;
  teamId: string | null;
  portal: 'admin' | 'my';
}

export interface AgentCapabilities {
  roleKey: AgentRoleKey;
  roleLabel: string;
  portal: 'admin' | 'my';
  scope: AgentDataScope;
  canScan: boolean;
  canManageSources: boolean;
  canPublish: boolean;
  canViewReports: boolean;
  canUseNotifications: boolean;
  canManageVps: boolean;
  canManageDevices: boolean;
}

export interface IngestCredentialInfo {
  keyId: string;
  secret: string;
  expiresAt: string | null;
}

export interface DesktopAuthState {
  authenticated: boolean;
  offlineMode?: boolean;
  user?: DesktopUserProfile | null;
  capabilities?: AgentCapabilities | null;
  plan?: string | null;
  features?: string[];
  expiresAt?: string | null;
  vpsUrl?: string;
  remember?: boolean;
  serverTime?: string;
  /** Shown on the login screen after logout / forced lock. */
  notice?: string;
}

export interface DesktopLoginResult {
  success: boolean;
  message?: string;
  code?: string;
  state?: DesktopAuthState;
}

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
  /** null/undefined = every source from the server is enabled. [] = scan nothing. */
  enabledSourceIds?: string[] | null;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  /** When true every DEMAND lead is pushed, otherwise only hot leads. */
  telegramNotifyAllDemand: boolean;
  /** Auto-download and install desktop agent updates from the VPS manifest. */
  autoUpdateEnabled: boolean;
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
  imageUrls?: string[];
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
  imageUrls?: string[];
}

export interface GeneratePostRequest {
  propertyId?: string;
  propertyData?: Partial<InventoryProperty>;
  tone?: string;
}

