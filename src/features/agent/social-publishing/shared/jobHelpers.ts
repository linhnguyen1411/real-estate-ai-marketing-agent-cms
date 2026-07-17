import type { SocialPublishJob } from '../../../../types/socialPublishing';

export function readPublishPermalink(job: SocialPublishJob): string | null {
  const result = (job.result || {}) as Record<string, unknown>;
  for (const key of ['publishedUrl', 'permalink', 'facebookPostUrl', 'externalUrl', 'externalPostUrl']) {
    const url = result[key];
    if (typeof url === 'string' && url.trim()) return url;
  }
  const evidence = result.evidence;
  if (evidence && typeof evidence === 'object') {
    const e = evidence as Record<string, unknown>;
    if (typeof e.publishedUrl === 'string' && e.publishedUrl.trim()) return e.publishedUrl;
  }
  const postId = result.facebookPostId || result.externalPostId;
  if (typeof postId === 'string' && postId.trim() && !postId.startsWith('dry_run_')) {
    return `https://www.facebook.com/${postId}`;
  }
  return null;
}

export function jobDurationMs(job: SocialPublishJob): number | null {
  if (job.startedAt && job.completedAt) {
    return Math.max(0, new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime());
  }
  const result = (job.result || {}) as Record<string, unknown>;
  if (typeof result.durationMs === 'number') return result.durationMs;
  return null;
}

export function jobStatusBucket(
  status: string,
): 'upcoming' | 'running' | 'completed' | 'failed' | 'other' {
  if (['queued'].includes(status)) return 'upcoming';
  if (['claimed', 'preparing', 'publishing'].includes(status)) return 'running';
  if (['published', 'cancelled', 'skipped'].includes(status)) return 'completed';
  if (status === 'failed') return 'failed';
  return 'other';
}
