/**
 * Push Control Plane Runtime Events → Notification Router (H0.3.6).
 */

import { listRuntimeEvents } from '../runtimeEventBus';
import { notification } from '../../../notifications/notificationRouter';
import {
  runtimeEventToNotificationType,
  type NotificationEventType,
} from '../../../notifications/notificationTypes';
import type { TelegramConsoleConfig } from './types';

export type EventNotifier = {
  start(): void;
  stop(): void;
  tickOnce(): Promise<number>;
};

const ALERT_COOLDOWN_MS = 60_000;

function isCriticalType(type: NotificationEventType): boolean {
  return [
    'cpu_high',
    'ram_high',
    'scheduler_down',
    'browser_crash',
    'execution_agent_offline',
    'heartbeat_lost',
    'fleet_zero',
  ].includes(type);
}

export function createTelegramEventNotifier(input: {
  config: TelegramConsoleConfig;
  listEvents?: typeof listRuntimeEvents;
  alertCooldownMs?: number;
}): EventNotifier {
  let timer: ReturnType<typeof setInterval> | null = null;
  let sinceMs = Date.now();
  const list = input.listEvents ?? listRuntimeEvents;
  const cooldown = input.alertCooldownMs ?? ALERT_COOLDOWN_MS;
  const lastSent = new Map<string, number>();

  const tickOnce = async (): Promise<number> => {
    if (!input.config.botToken || !input.config.enabled) return 0;
    const events = await list({
      companyId: input.config.companyId,
      types: [
        'MISSION_STARTED',
        'MISSION_COMPLETED',
        'MISSION_FAILED',
        'JOB_FAILED',
        'JOB_COMPLETED',
        'AGENT_ONLINE',
        'AGENT_OFFLINE',
        'BROWSER_LEASED',
        'BROWSER_RELEASED',
        'BROWSER_CRASH',
        'CAMPAIGN_COMPLETED',
        'OPS_REQUEST',
        'PUBLISH_STARTED',
        'PUBLISH_FINISHED',
        'QUEUE_BLOCKED',
      ],
      since: new Date(sinceMs),
      limit: 40,
    });
    if (events.length === 0) return 0;

    let newestMs = sinceMs;
    let sent = 0;
    const now = Date.now();
    for (const ev of events) {
      const t = Date.parse(ev.createdAt);
      if (Number.isFinite(t) && t > newestMs) newestMs = t;
      const notifType = runtimeEventToNotificationType(ev);
      if (!notifType) continue;
      const key = `${notifType}:${ev.entityId || ev.agentId || notifType}`;
      const prev = lastSent.get(key) || 0;
      if (now - prev < cooldown) continue;
      lastSent.set(key, now);

      const detail =
        typeof ev.payload?.error === 'string'
          ? ev.payload.error
          : typeof ev.payload?.reason === 'string'
            ? ev.payload.reason
            : null;

      await notification.send({
        type: notifType,
        payload: {
          entityId: ev.entityId,
          agentId: ev.agentId,
          publishJobId: notifType.startsWith('publish') ? ev.entityId : undefined,
          detail,
        },
        dedupeKey: key,
        immediate: isCriticalType(notifType) || notifType === 'mission_started',
        settings: undefined,
      });
      sent += 1;
    }
    sinceMs = newestMs;
    await notification.flushBatches();
    return sent;
  };

  return {
    start() {
      if (timer || !input.config.enabled) return;
      timer = setInterval(() => {
        void tickOnce().catch(() => undefined);
      }, input.config.eventNotifyIntervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    tickOnce,
  };
}
