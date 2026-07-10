import type { AuthUser } from '../../src/types';

export const AGENT_SOURCE_TYPES = ['facebook_group', 'website', 'forum', 'search'] as const;
export const AGENT_SOURCE_STATUSES = ['active', 'paused', 'error'] as const;
export const AGENT_MISSION_STATUSES = ['draft', 'active', 'paused', 'completed'] as const;
export const AGENT_JOB_STATUSES = ['queued', 'claimed', 'running', 'completed', 'failed', 'cancelled'] as const;
export const AGENT_FINDING_STATUSES = ['new', 'reviewed', 'promoted', 'dismissed'] as const;
export const AGENT_NOTIFICATION_STATUSES = ['unread', 'read', 'archived'] as const;

export type AgentSourceType = (typeof AGENT_SOURCE_TYPES)[number];
export type AgentSourceStatus = (typeof AGENT_SOURCE_STATUSES)[number];
export type AgentMissionStatus = (typeof AGENT_MISSION_STATUSES)[number];
export type AgentJobStatus = (typeof AGENT_JOB_STATUSES)[number];
export type AgentFindingStatus = (typeof AGENT_FINDING_STATUSES)[number];

export interface PaginationInput {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AgentRouteDeps {
  getAuthUser: (req: import('express').Request) => AuthUser;
  accessDefaults: (req: import('express').Request, body?: Record<string, unknown>) => {
    company_id: string;
    owner_user_id: string;
    assigned_member_ids: string[];
  };
}

export interface AgentDashboardCounts {
  activeSources: number;
  queuedJobs: number;
  runningJobs: number;
  newFindings: number;
  unreadNotifications: number;
  jobsFailed24h: number;
}

export interface MissionRules {
  sourceIds?: string[];
  minScore?: number;
  [key: string]: unknown;
}
