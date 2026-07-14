/**
 * Client-side href resolver for AgentNotification.data.link
 * (mirrors server resolveNotificationHref).
 */
export function resolveAgentNotificationHref(data: unknown): string {
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const link = (payload.link && typeof payload.link === 'object'
    ? payload.link
    : null) as Record<string, unknown> | null;

  const kind = String(link?.kind || '');
  if (kind === 'finding') return '/admin/agents/findings';
  if (kind === 'job') return '/admin/agents/jobs';
  if (kind === 'session') return '/admin/agents/sessions';
  if (kind === 'source') return '/admin/agents/sources';

  if (payload.findingId || payload.score !== undefined) return '/admin/agents/findings';
  if (payload.jobId) return '/admin/agents/jobs';
  if (payload.workerId || payload.sessionId) return '/admin/agents/sessions';
  if (payload.sourceId) return '/admin/agents/sources';
  return '/admin/agents/notifications';
}
