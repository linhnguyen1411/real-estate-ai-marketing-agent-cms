export interface PostBlock {
  blockId: string;
  selectorUsed: string;
  text: string;
  textPreview: string;
  rect: { top: number; bottom: number; left: number; right: number };
  url: string;
  sourceTitle: string;
}

export interface LeadPreview {
  title?: string;
  url?: string;
  raw_content?: string;
  selected_text?: string;
  phone: string;
  phones?: string[];
  possible_phones?: string[];
  demand_type?: string;
  property_type?: string;
  location?: string;
  budget?: number;
  ai_summary?: string;
  lead_score?: number;
  name?: string;
  confidence_score?: number;
  is_duplicate?: boolean;
  duplicate_reason?: string;
  source_url?: string;
  source_title?: string;
  blockId?: string;
  skippedReason?: string;
  selected?: boolean;
  leadIndex?: number;
  possibleDuplicate?: boolean;
}

export interface CollectedLead extends LeadPreview {
  dedupKey: string;
  collectedAt: string;
}

export interface SkippedItem {
  blockId: string;
  phone?: string;
  skippedReason: string;
}

export interface ScanRoundStats {
  visibleBlocksCount: number;
  newBlocksCount: number;
  phonesFoundTotal: number;
  leadsCreated: number;
  dedupedCount: number;
  skippedNoiseCount: number;
  skippedNoBdsContextCount: number;
}

export interface ScanRoundResult {
  leads: CollectedLead[];
  skipped: SkippedItem[];
  stats: ScanRoundStats;
}

export interface AutoScrollConfig {
  targetPosts: number;
  apiBase: string;
  token: string;
  sessionId: string;
}

export interface AutoScrollState {
  running: boolean;
  targetPosts: number;
  collectedLeads: CollectedLead[];
  skippedItems: SkippedItem[];
  loopCount: number;
  currentScrollY: number;
  previousScrollY: number;
  visibleBlocksCount: number;
  scannedBlocksTotal: number;
  phonesFoundTotal: number;
  leadsCreatedTotal: number;
  newMergedLeads: number;
  totalCollectedLeads: number;
  dedupedCount: number;
  skippedNoiseCount: number;
  skippedNoBdsContextCount: number;
  noNewBlockRounds: number;
  unchangedScrollRounds: number;
  stopReason: string;
  message: string;
  sessionId: string;
  startedAt: string;
}

export interface Settings {
  token?: string;
  apiBase?: string;
  email?: string;
}

export interface DebugState {
  storageAvailable?: boolean;
  context?: string;
  isTopFrame?: boolean;
  updatedAt?: string;
}

export type MessageType =
  | { type: 'SCAN_VISIBLE_BLOCKS' }
  | { type: 'START_AUTO_SCROLL'; config: AutoScrollConfig }
  | { type: 'STOP_AUTO_SCROLL' }
  | { type: 'HIGHLIGHT_BLOCK'; blockId: string }
  | { type: 'SCROLL_TO_BLOCK'; blockId: string }
  | { type: 'GET_SITE_POLICY' }
  | { type: 'PING' };

export type BackgroundMessageType =
  | { type: 'STORAGE_PING' }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; payload: Settings }
  | { type: 'GET_AUTO_SCROLL_STATE' }
  | { type: 'SAVE_AUTO_SCROLL_STATE'; payload: AutoScrollState }
  | { type: 'UPDATE_LEAD_SELECTION'; payload: { dedupKey: string; selected: boolean } }
  | { type: 'GET_COLLECT_TAB_ID' }
  | { type: 'SAVE_COLLECT_TAB_ID'; payload: number }
  | { type: 'GET_DEBUG_STATE' }
  | { type: 'SAVE_DEBUG_STATE'; payload: DebugState }
  | { type: 'API_EXTRACT_BATCH'; payload: { items: unknown[] } }
  | { type: 'API_BATCH_SAVE'; payload: { leads: unknown[]; source?: string } }
  | { type: 'RUN_LEAD_SAVE' }
  | { type: 'GET_LAST_SAVE_RESULT' }
  | { type: 'CLEAR_AUTO_SCROLL_STATE' };
