/**
 * Push Control Plane Runtime Events to Telegram (ops notifications).
 * Pulls Event Bus — does not subscribe to Worker or DB directly beyond Control Plane API.
 */

import { listRuntimeEvents } from '../runtimeEventBus';
import type { RuntimeEventType } from '../types';
import type { TelegramReplyPort } from './outbound';
import type { TelegramConsoleConfig } from './types';

const NOTIFY_TYPES: RuntimeEventType[] = [
  'MISSION_STARTED',
  'MISSION_COMPLETED',
  'MISSION_FAILED',
  'JOB_FAILED',
  'AGENT_ONLINE',
  'AGENT_OFFLINE',
  'BROWSER_LEASED',
  'CAMPAIGN_STARTED',
  'CAMPAIGN_COMPLETED',
];

/** Map event → human label (publish success/fail approximated via JOB_* + payload). */
function formatEventLine(ev: {
  type: string;
  entityId: string | null;
  agentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}): string | null {
  const id = ev.entityId || ev.agentId || '—';
  switch (ev.type) {
    case 'MISSION_STARTED':
      return `Mission Started: ${id}`;
    case 'MISSION_COMPLETED':
      return `Mission Completed: ${id}`;
    case 'MISSION_FAILED':
      return `Mission Failed: ${id}`;
    case 'AGENT_ONLINE':
      return `Agent Online: ${ev.agentId || id}`;
    case 'AGENT_OFFLINE':
      return `Agent Offline: ${ev.agentId || id}`;
    case 'JOB_FAILED': {
      const kind = String(ev.payload?.type || ev.payload?.jobType || '');
      if (kind.includes('publish')) return `Publish Failed: ${id}`;
      return `Queue Error / Job Failed: ${id}`;
    }
    case 'JOB_COMPLETED': {
      const kind = String(ev.payload?.type || ev.payload?.jobType || '');
      if (kind.includes('publish')) return `Publish Success: ${id}`;
      return null;
    }
    case 'BROWSER_LEASED':
      // Noise — only alert on explicit browser errors in payload
      if (ev.payload?.error || ev.payload?.crashed) {
        return `Browser Error: ${String(ev.payload.error || 'crash')} (${id})`;
      }
      return null;
    case 'CAMPAIGN_STARTED':
      return `Campaign Started: ${id}`;
    case 'CAMPAIGN_COMPLETED':
      return `Campaign Completed: ${id}`;
    default:
      return null;
  }
}

export type EventNotifier = {
  start(): void;
  stop(): void;
  /** Test hook */
  tickOnce(): Promise<number>;
};

export function createTelegramEventNotifier(input: {
  config: TelegramConsoleConfig;
  replyPort: TelegramReplyPort;
  listEvents?: typeof listRuntimeEvents;
}): EventNotifier {
  let timer: ReturnType<typeof setInterval> | null = null;
  let sinceMs = Date.now();
  const list = input.listEvents ?? listRuntimeEvents;
  const chatId = input.config.primaryChatId;

  const tickOnce = async (): Promise<number> => {
    if (!chatId || !input.config.botToken || !input.config.enabled) return 0;
    const events = await list({
      companyId: input.config.companyId,
      types: [...NOTIFY_TYPES, 'JOB_COMPLETED'],
      since: new Date(sinceMs),
      limit: 40,
    });
    if (events.length === 0) return 0;

    let newestMs = sinceMs;
    const lines: string[] = [];
    for (const ev of events) {
      const t = Date.parse(ev.createdAt);
      if (Number.isFinite(t) && t > newestMs) newestMs = t;
      const line = formatEventLine(ev);
      if (line) lines.push(`• ${line}`);
    }
    sinceMs = newestMs;

    if (lines.length === 0) return 0;
    const text = ['[Control Plane]', ...lines.slice(0, 15)].join('\n');
    await input.replyPort.reply({
      botToken: input.config.botToken,
      chatId,
      text,
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
