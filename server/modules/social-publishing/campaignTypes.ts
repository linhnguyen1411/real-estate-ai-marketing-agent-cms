/**
 * Campaign Engine — types + pure progress / plan helpers.
 * Multi-destination fan-out over existing SocialPublishJob path.
 */

export const CAMPAIGN_STATUSES = ['draft', 'active', 'archived'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'partial_success',
  'cancelled',
] as const;
export type CampaignRunStatus = (typeof CAMPAIGN_RUN_STATUSES)[number];

export const CAMPAIGN_TARGET_STATUSES = [
  'pending',
  'queued',
  'publishing',
  'published',
  'failed',
  'skipped',
] as const;
export type CampaignTargetStatus = (typeof CAMPAIGN_TARGET_STATUSES)[number];

export interface CampaignProgress {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  publishing: number;
  skipped: number;
}

export interface CampaignExecutionPlanItem {
  channelId: string;
  destinationKey: string | null;
  sortOrder: number;
}

export interface CampaignExecutionPlan {
  campaignId: string;
  draftId: string;
  scheduledAt: string;
  targets: CampaignExecutionPlanItem[];
}

/** Map SocialPublishJob.status → CampaignTarget status */
export function mapPublishJobToTargetStatus(jobStatus: string): CampaignTargetStatus {
  switch (jobStatus) {
    case 'published':
      return 'published';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'queued':
      return 'queued';
    case 'claimed':
    case 'preparing':
    case 'publishing':
      return 'publishing';
    default:
      return 'pending';
  }
}

export function buildCampaignProgress(
  targetStatuses: Array<{ status: string }>,
): CampaignProgress {
  const progress: CampaignProgress = {
    total: targetStatuses.length,
    completed: 0,
    failed: 0,
    pending: 0,
    publishing: 0,
    skipped: 0,
  };
  for (const t of targetStatuses) {
    switch (t.status) {
      case 'published':
        progress.completed += 1;
        break;
      case 'failed':
        progress.failed += 1;
        break;
      case 'skipped':
        progress.skipped += 1;
        break;
      case 'queued':
      case 'publishing':
        progress.publishing += 1;
        break;
      default:
        progress.pending += 1;
    }
  }
  return progress;
}

/**
 * Aggregate run status from progress.
 * - all published (or skipped) → completed
 * - all failed → failed
 * - mix published + failed, none in flight → partial_success
 * - any queued/publishing/pending → running (or queued if none started)
 */
export function classifyCampaignRunStatus(
  progress: CampaignProgress,
  options?: { started?: boolean },
): CampaignRunStatus {
  const { total, completed, failed, pending, publishing, skipped } = progress;
  if (total === 0) return 'failed';

  const terminal = completed + failed + skipped;
  const inFlight = pending + publishing;

  if (inFlight > 0) {
    return options?.started === false && publishing === 0 && completed === 0 && failed === 0
      ? 'queued'
      : 'running';
  }

  if (completed === total || (completed > 0 && failed === 0 && skipped === total - completed)) {
    return 'completed';
  }
  if (failed === total || (failed > 0 && completed === 0)) {
    return 'failed';
  }
  if (completed > 0 && failed > 0) {
    return 'partial_success';
  }
  if (terminal === total && completed > 0) {
    return 'completed';
  }
  return 'failed';
}

export function buildCampaignExecutionPlan(input: {
  campaignId: string;
  draftId: string;
  channelIds: string[];
  destinationKeys?: Array<string | null>;
  scheduledAt: Date;
}): CampaignExecutionPlan {
  const unique: string[] = [];
  for (const id of input.channelIds) {
    const trimmed = String(id || '').trim();
    if (trimmed && !unique.includes(trimmed)) unique.push(trimmed);
  }
  return {
    campaignId: input.campaignId,
    draftId: input.draftId,
    scheduledAt: input.scheduledAt.toISOString(),
    targets: unique.map((channelId, sortOrder) => ({
      channelId,
      destinationKey: input.destinationKeys?.[sortOrder] ?? null,
      sortOrder,
    })),
  };
}

export function parseDestinationChannelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => String(v || '').trim()).filter(Boolean);
}
