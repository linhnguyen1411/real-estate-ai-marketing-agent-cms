/**
 * Telegram Update Receiver abstraction — polling + webhook adapters.
 */

import type { TelegramConsoleConfig, TelegramUpdateReceiver } from './types';
import type { TelegramRouterDeps } from './router';
import { routeTelegramUpdate } from './router';

export type ReceiverFactoryDeps = {
  config: TelegramConsoleConfig;
  routerDeps: Omit<TelegramRouterDeps, 'config'> & { config?: TelegramConsoleConfig };
  onError?: (err: unknown) => void;
};

async function telegramApi(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return raw;
}

export function createPollingReceiver(deps: ReceiverFactoryDeps): TelegramUpdateReceiver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let offset = 0;
  const config = deps.config;

  const tick = async () => {
    if (stopped) return;
    try {
      const raw = await telegramApi(config.botToken, 'getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
      });
      const results = Array.isArray(raw.result) ? raw.result : [];
      for (const update of results) {
        const id = Number((update as { update_id?: number }).update_id);
        if (Number.isFinite(id)) offset = id + 1;
        await routeTelegramUpdate(update, {
          config,
          replyPort: deps.routerDeps.replyPort,
          runCommand: deps.routerDeps.runCommand,
        });
      }
    } catch (err) {
      deps.onError?.(err);
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          void tick();
        }, config.pollIntervalMs);
      }
    }
  };

  return {
    mode: 'polling',
    async start() {
      if (!stopped) return;
      stopped = false;
      // Drop pending updates on start to avoid replaying old commands
      try {
        const raw = await telegramApi(config.botToken, 'getUpdates', {
          offset: -1,
          timeout: 0,
        });
        const results = Array.isArray(raw.result) ? raw.result : [];
        for (const update of results) {
          const id = Number((update as { update_id?: number }).update_id);
          if (Number.isFinite(id)) offset = Math.max(offset, id + 1);
        }
      } catch {
        // ignore bootstrap errors
      }
      void tick();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Webhook receiver — Express handler only; start/stop are no-ops for HTTP mode.
 */
export function createWebhookReceiver(deps: ReceiverFactoryDeps): TelegramUpdateReceiver & {
  handleUpdate(raw: unknown): Promise<void>;
} {
  return {
    mode: 'webhook',
    async start() {
      // Webhook is driven by HTTP; optionally delete webhook conflicts left to ops.
    },
    async stop() {},
    async handleUpdate(raw: unknown) {
      await routeTelegramUpdate(raw, {
        config: deps.config,
        replyPort: deps.routerDeps.replyPort,
        runCommand: deps.routerDeps.runCommand,
      });
    },
  };
}

export function createTelegramUpdateReceiver(
  deps: ReceiverFactoryDeps,
): TelegramUpdateReceiver {
  if (deps.config.mode === 'webhook') {
    return createWebhookReceiver(deps);
  }
  return createPollingReceiver(deps);
}
