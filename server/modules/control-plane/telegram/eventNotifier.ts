/**
 * Push Control Plane Runtime Events to Telegram (smart ops notifications).
 * Pulls Event Bus — does not subscribe to Worker or DB directly beyond Control Plane API.
 */

import { listRuntimeEvents } from '../runtimeEventBus';
import {
  agentJobKeyboard,
  missionActionKeyboard,
  publishJobKeyboard,
  type InlineKeyboard,
} from '../inlineKeyboard';
import {
  formatSmartNotificationBullet,
  mapRuntimeEventToSmartKind,
  type SmartNotificationKind,
} from './smartNotifications';
import type { TelegramReplyPort } from './outbound';
import type { TelegramConsoleConfig } from './types';

function keyboardForKind(
  kind: SmartNotificationKind,
  entityId: string | null,
): InlineKeyboard | undefined {
  if (!entityId) return undefined;
  if (
    kind === 'MISSION_STARTED' ||
    kind === 'MISSION_COMPLETED' ||
    kind === 'MISSION_FAILED'
  ) {
    return missionActionKeyboard(entityId);
  }
  if (kind === 'PUBLISH_SUCCESS' || kind === 'PUBLISH_FAILED') {
    return publishJobKeyboard(entityId);
  }
  if (kind === 'CAMPAIGN_COMPLETED') {
    return agentJobKeyboard(entityId);
  }
  return undefined;
}

export type EventNotifier = {
  start(): void;
  stop(): void;
  /** Test hook */
  tickOnce(): Promise<number>;
};

const ALERT_COOLDOWN_MS = 60_000;

export function createTelegramEventNotifier(input: {
  config: TelegramConsoleConfig;
  replyPort: TelegramReplyPort;
  listEvents?: typeof listRuntimeEvents;
  /** Alert cooldown window (anti-spam) */
  alertCooldownMs?: number;
}): EventNotifier {
  let timer: ReturnType<typeof setInterval> | null = null;
  let sinceMs = Date.now();
  const list = input.listEvents ?? listRuntimeEvents;
  const chatId = input.config.primaryChatId;
  const cooldown = input.alertCooldownMs ?? ALERT_COOLDOWN_MS;
  const lastSent = new Map<string, number>();

  const tickOnce = async (): Promise<number> => {
    if (!chatId || !input.config.botToken || !input.config.enabled) return 0;
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
        'CAMPAIGN_COMPLETED',
        'OPS_REQUEST',
      ],
      since: new Date(sinceMs),
      limit: 40,
    });
    if (events.length === 0) return 0;

    let newestMs = sinceMs;
    const lines: string[] = [];
    let lastMarkup: InlineKeyboard | undefined;
    const now = Date.now();
    for (const ev of events) {
      const t = Date.parse(ev.createdAt);
      if (Number.isFinite(t) && t > newestMs) newestMs = t;
      const smartKind = mapRuntimeEventToSmartKind(ev);
      if (!smartKind) continue;
      const key = `${smartKind}:${ev.entityId || ev.agentId || smartKind}`;
      const prev = lastSent.get(key) || 0;
      if (now - prev < cooldown) continue;
      lastSent.set(key, now);
      lines.push(
        formatSmartNotificationBullet(smartKind, {
          entityId: ev.entityId,
          agentId: ev.agentId,
          detail:
            typeof ev.payload?.error === 'string'
              ? ev.payload.error
              : typeof ev.payload?.reason === 'string'
                ? ev.payload.reason
                : null,
        }),
      );
      lastMarkup = keyboardForKind(smartKind, ev.entityId) || lastMarkup;
    }
    sinceMs = newestMs;

    if (lines.length === 0) return 0;
    const text = ['[Ops Alert]', ...lines.slice(0, 15)].join('\n');
    await input.replyPort.reply({
      botToken: input.config.botToken,
      chatId,
      text,
      replyMarkup: lastMarkup,
    });
    return lines.length;
  };

  return {
    start() {
      if (timer || !input.config.enabled || !chatId) return;
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
