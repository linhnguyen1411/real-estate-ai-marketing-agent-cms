import type { SocialPublishJob } from '../../../../types/socialPublishing';

function isSyntheticPostId(id: string): boolean {
  const s = id.trim();
  return (
    !s ||
    s.startsWith('agent:') ||
    s.startsWith('dry_run_') ||
    s.startsWith('browser_') ||
    s.startsWith('stub_') ||
    s.includes(':')
  );
}

/** Group/home feed URLs are not post permalinks — don't surface them as "posted link". */
function isUsefulFacebookPermalink(url: string): boolean {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return false;
  try {
    const parsed = new URL(u);
    if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) return true;
    const path = parsed.pathname;
    const q = parsed.search;
    if (/\/posts\//i.test(path) || /\/permalink\//i.test(path) || /\/photo/i.test(path)) return true;
    if (/story_fbid=/i.test(q) || /multi_permalinks=/i.test(q)) return true;
    // Bare /groups/{id} or /profile.php without post markers — not a post.
    if (/^\/groups\/[^/]+\/?$/i.test(path)) return false;
    if (/^\/(me|home)\/?$/i.test(path) || path === '/') return false;
    return !/^\/groups\/[^/]+\/?$/i.test(path);
  } catch {
    return false;
  }
}

export function readPublishPermalink(job: SocialPublishJob): string | null {
  const result = (job.result || {}) as Record<string, unknown>;
  for (const key of ['publishedUrl', 'permalink', 'facebookPostUrl', 'externalUrl', 'externalPostUrl']) {
    const url = result[key];
    if (typeof url === 'string' && url.trim() && isUsefulFacebookPermalink(url)) return url.trim();
  }
  const evidence = result.evidence;
  if (evidence && typeof evidence === 'object') {
    const e = evidence as Record<string, unknown>;
    if (typeof e.publishedUrl === 'string' && e.publishedUrl.trim() && isUsefulFacebookPermalink(e.publishedUrl)) {
      return e.publishedUrl.trim();
    }
  }
  const postId = result.facebookPostId || result.externalPostId;
  if (typeof postId === 'string' && !isSyntheticPostId(postId)) {
    return `https://www.facebook.com/${postId.trim()}`;
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
