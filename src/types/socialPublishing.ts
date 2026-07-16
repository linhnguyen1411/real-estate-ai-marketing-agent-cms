/** Client types for Social Publishing MVP (`/api/social/*`). */

export const SOCIAL_DRAFT_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'scheduled',
  'publishing',
  'published',
  'archived',
] as const;

export const SOCIAL_JOB_STATUSES = [
  'queued',
  'claimed',
  'preparing',
  'publishing',
  'published',
  'failed',
  'cancelled',
  'skipped',
] as const;

export const SOCIAL_CHANNEL_STATUSES = ['active', 'paused', 'needs_login', 'error'] as const;

export const SOCIAL_CHANNEL_TYPES = ['facebook_profile', 'facebook_page'] as const;

export const SOCIAL_EXECUTION_MODES = ['browser', 'graph_api'] as const;

export type SocialDraftStatus = (typeof SOCIAL_DRAFT_STATUSES)[number];
export type SocialJobStatus = (typeof SOCIAL_JOB_STATUSES)[number];
export type SocialChannelStatus = (typeof SOCIAL_CHANNEL_STATUSES)[number];
export type SocialChannelType = (typeof SOCIAL_CHANNEL_TYPES)[number];
export type SocialExecutionMode = (typeof SOCIAL_EXECUTION_MODES)[number];

export interface SocialPostMedia {
  id: string;
  draftId: string;
  type: string;
  fileUrl: string;
  sortOrder: number;
  altText?: string | null;
  createdAt: string;
}

export interface SocialPostDraft {
  id: string;
  companyId?: string | null;
  title?: string | null;
  body: string;
  linkUrl?: string | null;
  status: SocialDraftStatus | string;
  createdBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  bodyHash?: string | null;
  normalizedBodyHash?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  media?: SocialPostMedia[];
}

export interface SocialChannel {
  id: string;
  companyId?: string | null;
  type: SocialChannelType | string;
  name: string;
  externalId?: string | null;
  profileUrl?: string | null;
  status: SocialChannelStatus | string;
  executionMode: SocialExecutionMode | string;
  browserSessionId?: string | null;
  config?: Record<string, unknown>;
  isActive: boolean;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPublishJob {
  id: string;
  companyId?: string | null;
  draftId: string;
  channelId: string;
  scheduledAt: string;
  status: SocialJobStatus | string;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  claimedBy?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  result?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  draft?: Pick<SocialPostDraft, 'id' | 'title' | 'status' | 'body'> | null;
  channel?: Pick<SocialChannel, 'id' | 'name' | 'type' | 'status'> | null;
}

export interface SocialPublishAuditLog {
  id: string;
  companyId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  actor?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface SocialChannelHealth {
  ok: boolean;
  status: SocialChannelStatus | string;
  checkedAt: string;
  details?: string;
  errorCode?: string;
}

export interface SocialSafetySettings {
  maxPostsPerDay: number;
  minSpacingMinutes: number;
  requireApproval: boolean;
  pauseAfterConsecutiveFailures: number;
  duplicateWindowDays: number;
  maxMediaCount: number;
  maxMediaBytes: number;
  allowedMime: string[];
}

export interface SocialMediaInput {
  type?: string;
  fileUrl: string;
  mime?: string;
  sizeBytes?: number;
  altText?: string;
  sortOrder?: number;
}

export interface CreateSocialDraftPayload {
  title?: string | null;
  body: string;
  linkUrl?: string | null;
  metadata?: Record<string, unknown>;
  media?: SocialMediaInput[];
  company_id?: string | null;
}

export interface UpdateSocialDraftPayload {
  title?: string | null;
  body?: string;
  linkUrl?: string | null;
  metadata?: Record<string, unknown>;
  media?: SocialMediaInput[];
}

export interface CreateSocialChannelPayload {
  type: SocialChannelType | string;
  name: string;
  externalId?: string | null;
  profileUrl?: string | null;
  executionMode: SocialExecutionMode | string;
  browserSessionId?: string | null;
  config?: Record<string, unknown>;
  company_id?: string | null;
}

export interface ApproveSchedulePayload {
  channelId?: string;
  scheduledAt?: string;
}

export interface ScheduleDraftPayload {
  channelId: string;
  scheduledAt: string;
}

export interface PublishNowPayload {
  channelId: string;
}

export interface ApproveAndScheduleResult {
  draft: SocialPostDraft;
  job: SocialPublishJob;
}

export interface RetryJobResult {
  job: SocialPublishJob;
  skipped: boolean;
  reason?: string;
}
