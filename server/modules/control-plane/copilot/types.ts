/**
 * Channel-agnostic Copilot types.
 * Telegram / Discord / Slack / Web Chat adapters map I/O only.
 */

import type { InlineKeyboard } from '../inlineKeyboard';

export type CopilotChannel =
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'zalo'
  | 'web'
  | 'voice'
  | 'cli';

export type CopilotIntentName =
  | 'whats_new'
  | 'lead_count'
  | 'agents_offline'
  | 'retry_failed_publish'
  | 'pause_scanner'
  | 'resume_publish'
  | 'search_leads'
  | 'search_jobs'
  | 'search_campaigns'
  | 'dashboard'
  | 'report'
  | 'insight'
  | 'approval_propose'
  | 'approval_action'
  | 'incident_action'
  | 'contextual_retry'
  | 'contextual_cancel'
  | 'help'
  | 'unknown'
  | 'raw_command'
  /** F4 — AI Operations Copilot */
  | 'fleet_summary'
  | 'scanner_summary'
  | 'publisher_summary'
  | 'mission_summary'
  | 'incident_summary'
  | 'machine_detail'
  | 'browser_detail'
  | 'runtime_explain'
  | 'ops_recommendation'
  /** H2 — AI Sales Employee (Planning Layer) */
  | 'ai_sales_campaign'
  | 'ai_sales_research'
  | 'ai_sales_missions'
  | 'ai_sales_leads'
  | 'ai_sales_content'
  | 'ai_sales_timeline'
  | 'ai_sales_recommendations'
  | 'ai_sales_help';

export type CopilotSlots = {
  location?: string;
  dateHint?: 'today' | 'week' | 'yesterday';
  missionName?: string;
  jobIndex?: number;
  jobId?: string;
  findingId?: string;
  agentId?: string;
  status?: string;
  action?: string;
  query?: string;
  reportKind?: string;
  rawCommand?: string;
};

export type ClassifiedIntent = {
  name: CopilotIntentName;
  confidence: number;
  slots: CopilotSlots;
  source: 'rule' | 'llm' | 'context' | 'command';
};

export type CopilotSessionContext = {
  channel: CopilotChannel;
  chatId: string;
  userId: string;
  companyId?: string | null;
  updatedAt: string;
  lastIntent?: CopilotIntentName;
  lastJobIds: string[];
  lastMissionIds: string[];
  lastFindingIds: string[];
  lastAgentIds: string[];
  lastListLabel?: string;
  mutedIncidentKeys: string[];
  pendingApprovalId?: string | null;
};

export type CopilotReply = {
  ok: boolean;
  text: string;
  lines: string[];
  intent: CopilotIntentName;
  data?: Record<string, unknown>;
  replyMarkup?: InlineKeyboard;
  /** Command executed via registry when applicable */
  command?: string;
};

export type CopilotMessageInput = {
  channel: CopilotChannel;
  chatId: string;
  userId: string;
  text: string;
  companyId?: string | null;
  /** Already a slash command — bypass NL */
  isCommand?: boolean;
};

export type CopilotClock = {
  now(): Date;
  /** IANA tz used for summary windows */
  timeZone: string;
};
