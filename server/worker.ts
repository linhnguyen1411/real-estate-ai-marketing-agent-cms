import 'dotenv/config';
import { validateEnv } from './config/env';
validateEnv();
import { ensureDatabaseReady } from './dbHelper';
import { startAgentScheduler, stopAgentScheduler } from './agent/agentScheduler';
import { startAgentSyncOutboxWorker, stopAgentSyncOutboxWorker } from './agentSync/outboxWorker';
import { startTelegramControlPlane, stopTelegramControlPlane } from './modules/control-plane';
import { prisma } from './prisma';

async function runWorker() {
  console.log('[WORKER] Starting dedicated background worker process...');

  try {
    await ensureDatabaseReady();
  } catch (error) {
    console.error('[WORKER] Failed to connect to PostgreSQL:', error);
    process.exit(1);
  }

  // Start background services
  startAgentScheduler();
  startAgentSyncOutboxWorker();

  void startTelegramControlPlane().then((r) => {
    if (r.started) {
      console.log('[WORKER] Telegram Control Plane client ready', r.status);
    } else {
      console.log(`[WORKER] Telegram not started (${r.reason || 'disabled'})`);
    }
  });

  void import('./modules/control-plane/operations').then((ops) => {
    ops.startMetricsCollector();
    console.log('[WORKER] Operations Center metrics collector started');
  }).catch((err) => {
    console.warn('[WORKER] Failed to start metrics collector:', err instanceof Error ? err.message : err);
  });

  console.log('[WORKER] Background worker initialized and running.');

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[WORKER] Received ${signal}. Stopping background workers gracefully...`);

    const timeout = setTimeout(() => {
      console.error('[WORKER] Force terminating after 20s shutdown timeout.');
      process.exit(1);
    }, 20_000);

    try {
      stopAgentScheduler();
      stopAgentSyncOutboxWorker();
      await stopTelegramControlPlane();
      const ops = await import('./modules/control-plane/operations').catch(() => null);
      if (ops) ops.stopMetricsCollector();
      await prisma.$disconnect();
      clearTimeout(timeout);
      console.log('[WORKER] Shutdown completed cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('[WORKER] Error during worker shutdown:', err);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void runWorker();
