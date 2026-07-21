/**
 * Notification channel + event types (H0.3.6).
 */

export const NOTIFICATION_CHANNELS = ['OPS', 'LEAD', 'PUBLISH', 'REPORT', 'CRITICAL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENT_TYPES = [
  // OPS
  'fleet',
  'runtime',
  'health',
  'agent_online',
  'browser_lease',
  'planner',
  'mission_started',
  'mission_finished',
  // LEAD
  'lead_found',
  'lead_score',
  'lead_ai_insight',
  // PUBLISH
  'publish_scheduled',
  'publishing',
  'publish_success',
  'publish_failed',
  'retry_publish',
  // REPORT
  'daily_08',
  'daily_12',
  'daily_18',
  'weekly',
  // CRITICAL
  'cpu_high',
  'ram_high',
  'scheduler_down',
  'browser_crash',
  'execution_agent_offline',
  'heartbeat_lost',
  'fleet_zero',
  // Console reply (same chat — not channel-routed)
  'console_reply',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export type NotificationPayload = {
  entityId?: string | null;
  agentId?: string | null;
  findingId?: string | null;
  publishJobId?: string | null;
  channelId?: string | null;
  score?: number | null;
  summary?: string | null;
  recommendation?: string | null;
  detail?: string | null;
  title?: string | null;
  postUrl?: string | null;
  groupUrl?: string | null;
  evidenceUrl?: string | null;
  extraLines?: string[];
  batchCount?: number;
  batchItems?: Array<{ id: string; score?: number; summary?: string }>;
};

/** Event type → notification channel */
export const EVENT_CHANNEL_MAP: Record<NotificationEventType, NotificationChannel | null> = {
  fleet: 'OPS',
  runtime: 'OPS',
  health: 'OPS',
  agent_online: 'OPS',
  browser_lease: 'OPS',
  planner: 'OPS',
  mission_started: 'OPS',
  mission_finished: 'OPS',
  lead_found: 'LEAD',
  lead_score: 'LEAD',
  lead_ai_insight: 'LEAD',
  publish_scheduled: 'PUBLISH',
  publishing: 'PUBLISH',
  publish_success: 'PUBLISH',
  publish_failed: 'PUBLISH',
  retry_publish: 'PUBLISH',
  daily_08: 'REPORT',
  daily_12: 'REPORT',
  daily_18: 'REPORT',
  weekly: 'REPORT',
  cpu_high: 'CRITICAL',
  ram_high: 'CRITICAL',
  scheduler_down: 'CRITICAL',
  browser_crash: 'CRITICAL',
  execution_agent_offline: 'CRITICAL',
  heartbeat_lost: 'CRITICAL',
  fleet_zero: 'CRITICAL',
  console_reply: null,
};

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  OPS: '🤖 AI Ops',
  LEAD: '🎯 Lead Alerts',
  PUBLISH: '📢 Publishing',
  REPORT: '📊 Daily Reports',
  CRITICAL: '🚨 Critical Alerts',
};

export function resolveChannelForEvent(type: NotificationEventType): NotificationChannel | null {
  return EVENT_CHANNEL_MAP[type] ?? null;
}

/** Map legacy smart notification kinds → router event types */
export function smartKindToEventType(kind: string): NotificationEventType | null {
  const map: Record<string, NotificationEventType> = {
    MISSION_STARTED: 'mission_started',
    MISSION_COMPLETED: 'mission_finished',
    MISSION_FAILED: 'mission_finished',
    PUBLISH_SUCCESS: 'publish_success',
    PUBLISH_FAILED: 'publish_failed',
    LEAD_FOUND: 'lead_found',
    AGENT_ONLINE: 'agent_online',
    AGENT_OFFLINE: 'execution_agent_offline',
    BROWSER_CRASH: 'browser_crash',
    QUEUE_BLOCKED: 'planner',
    CAMPAIGN_COMPLETED: 'mission_finished',
  };
  return map[kind] || null;
}

/** Map runtime event bus type → router event type */
export function runtimeEventToNotificationType(ev: {
  type: string;
  payload: Record<string, unknown>;
}): NotificationEventType | null {
  const type = String(ev.type || '');
  const payload = ev.payload || {};
  const jobType = String(payload.type || payload.jobType || '');

  switch (type) {
    case 'MISSION_STARTED':
      return 'mission_started';
    case 'MISSION_COMPLETED':
      return 'mission_finished';
    case 'MISSION_FAILED':
      return 'mission_finished';
    case 'AGENT_ONLINE':
      return 'agent_online';
    case 'AGENT_OFFLINE':
    case 'AGENT_RESTART':
      return 'execution_agent_offline';
    case 'BROWSER_LEASED':
    case 'BROWSER_RELEASED':
      return 'browser_lease';
    case 'BROWSER_CRASH':
    case 'BROWSER_EXPIRED':
      return 'browser_crash';
    case 'BROWSER_HEARTBEAT':
    case 'BROWSER_TAKEOVER':
    case 'BROWSER_RESTARTED': {
      const err = String(payload.error || payload.reason || '').toLowerCase();
      if (payload.crashed === true || err.includes('crash') || err.includes('orphan')) {
        return 'browser_crash';
      }
      return null;
    }
    case 'JOB_COMPLETED':
      return jobType.includes('publish') ? 'publish_success' : null;
    case 'JOB_FAILED':
      if (payload.queueBlocked === true || Number(payload.waiting || 0) > 50) return 'planner';
      return jobType.includes('publish') ? 'publish_failed' : null;
    case 'PUBLISH_STARTED':
      return 'publishing';
    case 'PUBLISH_FINISHED':
      return 'publish_success';
    case 'QUEUE_BLOCKED':
      return 'planner';
    case 'OPS_REQUEST':
      if (String(payload.action || '').includes('queue_blocked')) return 'planner';
      return 'runtime';
    case 'CAMPAIGN_COMPLETED':
      return 'mission_finished';
    default:
      return null;
  }
}
