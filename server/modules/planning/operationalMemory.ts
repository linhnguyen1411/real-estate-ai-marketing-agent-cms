/**
 * Operational Memory — AI employee timeline via Control Plane event bus.
 * Uses PLANNING_* event types only (append-only); never mutates Runtime queues.
 */

import { emitRuntimeEvent, listRuntimeEvents } from '../control-plane/runtimeEventBus';
import type { TimelineEntry } from './types';

export async function rememberPlanningEvent(input: {
  companyId?: string | null;
  kind: string;
  title: string;
  detail?: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await emitRuntimeEvent({
    type: 'PLANNING_EVENT',
    companyId: input.companyId ?? null,
    entityType: input.entityType ?? 'planning',
    entityId: input.entityId ?? null,
    payload: {
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? null,
      ...(input.payload || {}),
    },
  });
}

export async function loadTodayTimeline(input?: {
  companyId?: string | null;
  limit?: number;
}): Promise<TimelineEntry[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const events = await listRuntimeEvents({
    companyId: input?.companyId,
    types: ['PLANNING_EVENT', 'CAMPAIGN_STARTED', 'CAMPAIGN_COMPLETED', 'PUBLISH_FINISHED', 'MISSION_COMPLETED'],
    since: start,
    limit: input?.limit ?? 80,
  });

  return events
    .map(e => {
      const p = e.payload || {};
      const title =
        typeof p.title === 'string'
          ? p.title
          : typeof p.kind === 'string'
            ? String(p.kind)
            : e.type;
      const detail =
        typeof p.detail === 'string'
          ? p.detail
          : typeof p.summary === 'string'
            ? p.summary
            : undefined;
      return {
        at: e.createdAt,
        kind: typeof p.kind === 'string' ? p.kind : e.type,
        title,
        detail,
      } satisfies TimelineEntry;
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function formatTimelineLines(entries: TimelineEntry[]): string[] {
  if (!entries.length) {
    return ['Timeline hôm nay trống — chưa có hoạt động AI Employee.'];
  }
  const lines = ['Hôm nay AI đã làm gì', '────────────────────────────────'];
  for (const e of entries) {
    const hhmm = new Date(e.at).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    lines.push(`${hhmm}  ${e.title}${e.detail ? ` — ${e.detail}` : ''}`);
  }
  return lines;
}
