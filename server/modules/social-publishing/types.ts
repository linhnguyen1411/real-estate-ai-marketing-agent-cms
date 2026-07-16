import type { SocialChannel, SocialPostDraft, SocialPostMedia, SocialPublishJob } from '@prisma/client';

export const DRAFT_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'scheduled',
  'publishing',
  'published',
  'archived',
] as const;

export const JOB_STATUSES = [
  'queued',
  'claimed',
  'preparing',
  'publishing',
  'published',
  'failed',
  'cancelled',
  'skipped',
] as const;

export const CHANNEL_STATUSES = ['active', 'paused', 'needs_login', 'error'] as const;

export const CHANNEL_TYPES = ['facebook_profile', 'facebook_page'] as const;

export const EXECUTION_MODES = ['browser', 'graph_api'] as const;

export const PUBLISH_ERROR_CODES = [
  'channel_inactive',
  'channel_paused',
  'channel_needs_login',
  'channel_locked',
  'daily_cap',
  'spacing',
  'duplicate',
  'not_approved',
  'media_invalid',
  'graph_token_expired',
  'graph_api_error',
  'browser_auth_blocked',
  'browser_composer_not_found',
  'browser_publish_failed',
  'dry_run',
  'already_published',
  'max_attempts',
  'unknown',
] as const;

export type DraftStatus = (typeof DRAFT_STATUSES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];
export type ChannelType = (typeof CHANNEL_TYPES)[number];
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export type PublishErrorCode = (typeof PUBLISH_ERROR_CODES)[number];

export const DEFAULT_SAFETY_SETTINGS = {
  maxPostsPerDay: 3,
  minSpacingMinutes: 120,
  requireApproval: true,
  pauseAfterConsecutiveFailures: 2,
  duplicateWindowDays: 14,
  maxMediaCount: 4,
  maxMediaBytes: 8_000_000,
  allowedMime: ['image/jpeg', 'image/png', 'image/webp'] as const,
} as const;

export type SafetySettings = {
  -readonly [K in keyof typeof DEFAULT_SAFETY_SETTINGS]: (typeof DEFAULT_SAFETY_SETTINGS)[K] extends readonly (infer U)[]
    ? U[]
    : (typeof DEFAULT_SAFETY_SETTINGS)[K];
};

export interface PublishResult {
  ok: boolean;
  externalPostId?: string;
  externalUrl?: string;
  dryRun?: boolean;
  errorCode?: PublishErrorCode | string;
  errorMessage?: string;
  raw?: Record<string, unknown>;
}

export interface ChannelHealth {
  ok: boolean;
  status: ChannelStatus | string;
  checkedAt: string;
  details?: string;
  errorCode?: PublishErrorCode | string;
}

export interface PublishContext {
  job: SocialPublishJob;
  draft: SocialPostDraft & { media?: SocialPostMedia[] };
  channel: SocialChannel;
  workerId: string;
}

export interface SocialPublisher {
  supports(channel: SocialChannel): boolean;
  verifyChannel(channel: SocialChannel): Promise<ChannelHealth>;
  publish(ctx: PublishContext): Promise<PublishResult>;
}

export const ACTIVE_JOB_STATUSES: JobStatus[] = ['claimed', 'preparing', 'publishing'];
export const AGENT_JOB_TYPE_PUBLISH_SOCIAL = 'publish_social';
