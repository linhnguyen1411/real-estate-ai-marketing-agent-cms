import { getSettings } from '../dbHelper';
import { processOutboxBatch } from './outboxService';

const DEFAULT_INTERVAL_MS = 15_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function isLocalSyncEnvEnabled(): boolean {
  return process.env.AGENT_LOCAL_SYNC_ENABLED?.trim().toLowerCase() === 'true';
}

export async function flushAgentSyncOutbox(limit?: number): Promise<{
  processed: number;
  synced: number;
  failed: number;
  skipped?: string;
}> {
  if (!isLocalSyncEnvEnabled()) {
    return { processed: 0, synced: 0, failed: 0, skipped: 'env_disabled' };
  }
  const settings = getSettings();
  if (!settings.agent_sync_enabled) {
    return { processed: 0, synced: 0, failed: 0, skipped: 'settings_disabled' };
  }
  if (running) {
    return { processed: 0, synced: 0, failed: 0, skipped: 'busy' };
  }
  running = true;
  try {
    const result = await processOutboxBatch({ limit });
    if (result.processed > 0) {
      console.log(
        `[agent-sync] outbox flush processed=${result.processed} synced=${result.synced} failed=${result.failed}`,
      );
    }
    return result;
  } catch (error) {
    console.warn(
      '[agent-sync] outbox flush error:',
      error instanceof Error ? error.message : error,
    );
    return { processed: 0, synced: 0, failed: 0, skipped: 'error' };
  } finally {
    running = false;
  }
}

/** Kick a non-blocking flush soon after enqueue. */
export function scheduleAgentSyncFlush(delayMs = 500): void {
  if (!isLocalSyncEnvEnabled()) return;
  setTimeout(() => {
    void flushAgentSyncOutbox();
  }, delayMs);
}

export function startAgentSyncOutboxWorker(options?: {
  intervalMs?: number;
}): void {
  if (!isLocalSyncEnvEnabled()) {
    console.log('[agent-sync] Outbox worker disabled (AGENT_LOCAL_SYNC_ENABLED≠true)');
    return;
  }
  if (timer) return;
  const intervalMs = Math.max(
    5_000,
    Number(options?.intervalMs || process.env.AGENT_LOCAL_SYNC_INTERVAL_MS || DEFAULT_INTERVAL_MS),
  );
  console.log(`[agent-sync] Outbox worker started (every ${intervalMs}ms)`);
  void flushAgentSyncOutbox();
  timer = setInterval(() => {
    void flushAgentSyncOutbox();
  }, intervalMs);
}

export function stopAgentSyncOutboxWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
