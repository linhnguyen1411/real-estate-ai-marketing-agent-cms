/**
 * AI Recommendations — map incidents → suggested Control Plane actions.
 */

import type { OpsIncident } from './operationalIntelligence';

export type OpsRecommendation = {
  incidentId: string;
  summary: string;
  actionLabel: string;
  /** Slash command routed via Control Plane (never direct Runtime). */
  command?: string | null;
  /** Inline callback scope hint */
  action?:
    | 'retry'
    | 'release_browser'
    | 'restart_agent'
    | 'remove_source'
    | 'ignore'
    | 'refresh'
    | 'open_mission'
    | 'view_logs'
    | null;
  entityId?: string | null;
};

export function recommendForIncident(incident: OpsIncident): OpsRecommendation {
  const entity = incident.entityId || incident.machineId || '';
  switch (incident.kind) {
    case 'source_removed':
      return {
        incidentId: incident.id,
        summary: 'Không nên Retry — source đã bị xoá, retry sẽ thất bại.',
        actionLabel: 'Remove Source / bỏ job',
        action: 'remove_source',
        command: entity ? `/jobs failed` : '/jobs failed',
        entityId: entity || null,
      };
    case 'browser_locked':
    case 'hot_browser':
      return {
        incidentId: incident.id,
        summary: 'Browser đang bị giữ — giải phóng trước khi chạy tiếp.',
        actionLabel: 'Release Browser',
        action: 'release_browser',
        command: '/browser release',
        entityId: entity || null,
      };
    case 'publish_failure':
      return {
        incidentId: incident.id,
        summary: 'Publish lỗi — thử lại các job failed nếu session còn sống.',
        actionLabel: 'Retry',
        action: 'retry',
        command: '/publish retry',
        entityId: entity || null,
      };
    case 'offline_agent':
      return {
        incidentId: incident.id,
        summary: 'Agent mất heartbeat — restart hoặc kiểm tra process trên máy.',
        actionLabel: 'Restart Agent',
        action: 'restart_agent',
        command: entity ? `/agent restart ${entity}` : '/agents',
        entityId: entity || null,
      };
    case 'checkpoint':
      return {
        incidentId: incident.id,
        summary: 'Facebook checkpoint — cần đăng nhập lại trên Chrome CDP.',
        actionLabel: 'Open Browser / login',
        action: 'view_logs',
        command: '/browser',
        entityId: entity || null,
      };
    case 'memory_high':
      return {
        incidentId: incident.id,
        summary: 'Memory cao — cân nhắc Release / Restart Browser.',
        actionLabel: 'Restart Browser',
        action: 'release_browser',
        command: '/browser recover',
        entityId: entity || null,
      };
    case 'retry_loop':
      return {
        incidentId: incident.id,
        summary: 'Nhiều job retry — kiểm tra nguyên nhân gốc trước khi retry hàng loạt.',
        actionLabel: 'View Logs',
        action: 'view_logs',
        command: '/jobs failed',
        entityId: entity || null,
      };
    case 'queue_backlog':
      return {
        incidentId: incident.id,
        summary: 'Queue tồn đọng — kiểm tra fleet capacity / idle machines.',
        actionLabel: 'Refresh',
        action: 'refresh',
        command: '/fleet',
        entityId: entity || null,
      };
    case 'scanner_idle':
      return {
        incidentId: incident.id,
        summary: 'Scanner không có việc — có thể hết source pending.',
        actionLabel: 'Refresh',
        action: 'refresh',
        command: '/report scan',
        entityId: entity || null,
      };
    case 'slot_full':
      return {
        incidentId: incident.id,
        summary: 'Execution slot đầy — đợi job hiện tại xong.',
        actionLabel: 'Ignore',
        action: 'ignore',
        command: null,
        entityId: entity || null,
      };
    case 'idle_machine':
      return {
        incidentId: incident.id,
        summary: 'Máy idle trong khi còn queue — kiểm tra claim / scheduler.',
        actionLabel: 'Refresh',
        action: 'refresh',
        command: '/dashboard',
        entityId: entity || null,
      };
    default:
      return {
        incidentId: incident.id,
        summary: 'Theo dõi và refresh runtime.',
        actionLabel: 'Refresh',
        action: 'refresh',
        command: '/dashboard',
        entityId: entity || null,
      };
  }
}

export function recommendAll(incidents: OpsIncident[]): OpsRecommendation[] {
  return incidents.map(recommendForIncident);
}
