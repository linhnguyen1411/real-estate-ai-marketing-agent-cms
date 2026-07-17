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

/** UI connection health; distinct from operational channel status. */
export const SOCIAL_CHANNEL_CONNECTION_STATES = [
  'connected',
  'disconnected',
  'expired',
  'permission_error',
] as const;

export const SOCIAL_CHANNEL_TYPES = [
  'facebook_profile',
  'facebook_page',
  'facebook_group',
] as const;

export const SOCIAL_EXECUTION_MODES = ['browser', 'graph_api'] as const;

export type SocialDraftStatus = (typeof SOCIAL_DRAFT_STATUSES)[number];
export type SocialJobStatus = (typeof SOCIAL_JOB_STATUSES)[number];
export type SocialChannelStatus = (typeof SOCIAL_CHANNEL_STATUSES)[number];
export type SocialChannelConnectionState = (typeof SOCIAL_CHANNEL_CONNECTION_STATES)[number];
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
  connectionState?: SocialChannelConnectionState | string | null;
  lastVerifiedAt?: string | null;
  lastVerifyError?: string | null;
  tokenExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPublishAttempt {
  id: string;
  companyId?: string | null;
  jobId: string;
  draftId: string;
  channelId: string;
  workerId?: string | null;
  attemptNumber: number;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  facebookPostId?: string | null;
  facebookPostUrl?: string | null;
  requestJson?: Record<string, unknown> | null;
  responseJson?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
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

export interface ConnectSocialChannelPayload {
  pageAccessToken: string;
  pageId?: string;
  pageName?: string;
}

export interface ConnectSocialChannelResult {
  channel: SocialChannel;
  health: SocialChannelHealth | null;
}

export interface DestinationCapabilities {
  supportsText: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsLinks: boolean;
  supportsScheduling: boolean;
  supportsVerification: boolean;
}

export interface SocialDestinationInfo {
  key: string;
  label: string;
  capabilities: DestinationCapabilities;
}

export interface PublishEvidenceEntry {
  attemptId: string;
  manifest: {
    publishJobId: string;
    missionRunId: string;
    durationMs: number;
    publishedUrl?: string | null;
    screenshotBeforePath?: string | null;
    screenshotAfterPath?: string | null;
    htmlSnapshotPath?: string | null;
    capturedAt: string;
    destinationKey?: string | null;
  } | null;
  paths: {
    manifestPath: string;
    screenshotBeforePath: string;
    screenshotAfterPath: string;
    htmlSnapshotPath: string;
  };
  files: {
    hasScreenshotBefore: boolean;
    hasScreenshotAfter: boolean;
    hasHtmlSnapshot: boolean;
  };
}

export interface CampaignProgress {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  publishing: number;
  skipped: number;
}

export interface SocialCampaignRunSummary {
  id: string;
  status: string;
  progress?: CampaignProgress | Record<string, unknown> | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface SocialCampaignTarget {
  id: string;
  channelId: string;
  destinationKey?: string | null;
  status: string;
  publishJobId?: string | null;
  missionRunId?: string | null;
  permalink?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  attempts?: number;
}

export interface SocialCampaignRunDetail extends SocialCampaignRunSummary {
  targets?: SocialCampaignTarget[];
  triggerType?: string;
  triggeredBy?: string | null;
  scheduledAt?: string | null;
  errorMessage?: string | null;
}

export interface SocialCampaign {
  id: string;
  companyId?: string | null;
  name: string;
  draftId: string;
  status: string;
  destinationChannelIds: string[] | unknown;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  draft?: Pick<SocialPostDraft, 'id' | 'title' | 'status' | 'body'> | null;
  runs?: SocialCampaignRunDetail[];
}

export interface CreateSocialCampaignPayload {
  name: string;
  draftId: string;
  channelIds: string[];
  metadata?: Record<string, unknown>;
  company_id?: string | null;
}
