/**
 * Smart Notification registry — single catalog for ops + lead alerts.
 * Telegram formats via this module; no business logic here.
 */

export const SMART_NOTIFICATION_KINDS = [
  'MISSION_STARTED',
  'MISSION_COMPLETED',
  'MISSION_FAILED',
  'PUBLISH_SUCCESS',
  'PUBLISH_FAILED',
  'LEAD_FOUND',
  'AGENT_OFFLINE',
  'AGENT_ONLINE',
  'BROWSER_CRASH',
  'QUEUE_BLOCKED',
  'CAMPAIGN_COMPLETED',
] as const;

export type SmartNotificationKind = (typeof SMART_NOTIFICATION_KINDS)[number];

export type SmartNotificationPayload = {
  entityId?: string | null;
  agentId?: string | null;
  detail?: string | null;
  score?: number | null;
  extraLines?: string[];
};

const LABELS: Record<SmartNotificationKind, string> = {
  MISSION_STARTED: 'Mission Started',
  MISSION_COMPLETED: 'Mission Completed',
  MISSION_FAILED: 'Mission Failed',
  PUBLISH_SUCCESS: 'Publish Success',
  PUBLISH_FAILED: 'Publish Failed',
  LEAD_FOUND: 'Lead Found',
  AGENT_OFFLINE: 'Agent Offline',
  AGENT_ONLINE: 'Agent Online',
  BROWSER_CRASH: 'Browser Crash',
  QUEUE_BLOCKED: 'Queue Blocked',
  CAMPAIGN_COMPLETED: 'Campaign Completed',
};

export function isSmartNotificationKind(value: string): value is SmartNotificationKind {
  return (SMART_NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export function smartNotificationLabel(kind: SmartNotificationKind): string {
  return LABELS[kind];
}

/** Map Runtime Event → smart notification kind (or null to skip). */
export function mapRuntimeEventToSmartKind(ev: {
  type: string;
  payload: Record<string, unknown>;
}): SmartNotificationKind | null {
  const type = String(ev.type || '');
  const payload = ev.payload || {};
  const kind = String(payload.type || payload.jobType || '');

  switch (type) {
    case 'MISSION_STARTED':
      return 'MISSION_STARTED';
    case 'MISSION_COMPLETED':
      return 'MISSION_COMPLETED';
    case 'MISSION_FAILED':
      return 'MISSION_FAILED';
    case 'AGENT_ONLINE':
      return 'AGENT_ONLINE';
    case 'AGENT_OFFLINE':
      return 'AGENT_OFFLINE';
    case 'CAMPAIGN_COMPLETED':
      return 'CAMPAIGN_COMPLETED';
    case 'JOB_COMPLETED':
      if (kind.includes('publish')) return 'PUBLISH_SUCCESS';
      return null;
    case 'JOB_FAILED': {
      if (payload.queueBlocked === true || payload.reason === 'queue_blocked') {
        return 'QUEUE_BLOCKED';
      }
      if (Number(payload.waiting || 0) > 50) return 'QUEUE_BLOCKED';
      if (kind.includes('publish')) return 'PUBLISH_FAILED';
      return null;
    }
    case 'BROWSER_LEASED':
    case 'BROWSER_RELEASED': {
      const err = String(payload.error || payload.reason || '').toLowerCase();
      if (payload.crashed === true || err.includes('crash') || err.includes('browser')) {
        return 'BROWSER_CRASH';
      }
      return null;
    }
    case 'OPS_REQUEST':
      if (String(payload.action || '').includes('queue_blocked')) return 'QUEUE_BLOCKED';
      return null;
    default:
      if (isSmartNotificationKind(type)) return type;
      return null;
  }
}

export function formatSmartNotification(
  kind: SmartNotificationKind,
  payload: SmartNotificationPayload = {},
): string {
  const id = payload.entityId || payload.agentId || '—';
  const label = LABELS[kind];
  const lines: string[] = [];

  switch (kind) {
    case 'LEAD_FOUND': {
      const score = payload.score != null ? ` (${payload.score}/100)` : '';
      lines.push(`Lead Found${score}`);
      break;
    }
    case 'AGENT_ONLINE':
    case 'AGENT_OFFLINE':
      lines.push(`${label}: ${payload.agentId || id}`);
      break;
    case 'BROWSER_CRASH':
      lines.push(`${label}: ${payload.detail || id}`);
      break;
    case 'QUEUE_BLOCKED':
      lines.push(`${label}: ${payload.detail || id}`);
      break;
    default:
      lines.push(`${label}: ${id}`);
  }

  if (payload.detail && kind !== 'BROWSER_CRASH' && kind !== 'QUEUE_BLOCKED') {
    lines.push(String(payload.detail).slice(0, 200));
  }
  if (payload.extraLines?.length) {
    lines.push(...payload.extraLines.map(l => String(l).slice(0, 300)));
  }
  return lines.filter(Boolean).join('\n');
}

/** One-line ops alert bullet */
export function formatSmartNotificationBullet(
  kind: SmartNotificationKind,
  payload: SmartNotificationPayload = {},
): string {
  const id = payload.entityId || payload.agentId || '—';
  const label = LABELS[kind];
  if (kind === 'AGENT_ONLINE' || kind === 'AGENT_OFFLINE') {
    return `• ${label}: ${payload.agentId || id}`;
  }
  if (kind === 'LEAD_FOUND') {
    const score = payload.score != null ? ` (${payload.score}/100)` : '';
    return `• ${label}${score}: ${id}`;
  }
  if (payload.detail) return `• ${label}: ${id} — ${String(payload.detail).slice(0, 80)}`;
  return `• ${label}: ${id}`;
}
