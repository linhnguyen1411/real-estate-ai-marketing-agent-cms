import 'dotenv/config';
import { checkDatabaseConnection } from '../prisma';
import { ensureDatabaseReady } from '../dbHelper';
import { BrowserManager } from './browserManager';
import { buildBrowserSessionMetadata, loadWorkerConfig } from './config';
import { registerGracefulShutdown } from './gracefulShutdown';
import { HeartbeatService } from './heartbeat';
import { reclaimOrphanedAgentJobs } from './jobClaimer';
import { BrowserPool, ExecutionPool } from './runtime';
import { WorkerLoop } from './workerLoop';
import './scanSourceHandler';

async function main(): Promise<void> {
  const config = loadWorkerConfig();

  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.error(`[agent-worker] Database unavailable: ${db.message}`);
    process.exit(1);
  }

  // Required for getSettings() / agent_sync_enabled used by VPS outbox enqueue
  await ensureDatabaseReady();
  console.log(
    `[agent-worker] Settings ready — AGENT_LOCAL_SYNC=${process.env.AGENT_LOCAL_SYNC_ENABLED || 'false'}`,
  );

  const reclaimed = await reclaimOrphanedAgentJobs({ workerId: config.workerId, staleMs: 60_000 });
  if (reclaimed > 0) {
    console.log(`[agent-worker] Reclaimed ${reclaimed} orphaned claimed/running job(s)`);
  }

  console.log('[agent-worker] Starting Browser Worker');
  console.log(`  workerId:    ${config.workerId}`);
  console.log(`  browserMode: ${config.browserMode}`);
  console.log(`  profileDir:  ${config.profileDir}`);
  console.log(`  channel:     ${config.browserChannel}`);
  console.log(`  headless:    ${config.headless}`);
  if (config.cdpEndpoint) {
    console.log(`  cdpHost:     ${config.cdpEndpoint.host}`);
    console.log(`  cdpPort:     ${config.cdpEndpoint.port}`);
  }
  console.log(`  heartbeat:   ${config.heartbeatIntervalMs}ms`);
  console.log(`  poll:        ${config.pollIntervalMs}ms`);

  const browser = new BrowserManager(config);
  const executionPool = new ExecutionPool();
  const browserPool = new BrowserPool(browser, config);
  const heartbeat = new HeartbeatService(config);
  const loop = new WorkerLoop(config, browser, executionPool, browserPool);

  console.log(
    `[agent-worker] Execution pool: ${JSON.stringify(
      executionPool.snapshot().map(s => ({
        kind: s.kind,
        max: s.maxConcurrency,
        status: s.status,
      })),
    )}`,
  );

  await heartbeat.register(() => browser.currentUrl(), buildBrowserSessionMetadata(config));

  registerGracefulShutdown(async signal => {
    loop.stop();
    await loop.releaseCurrentJob(`Worker shutdown (${signal})`);
    browserPool.releaseAll();
    executionPool.releaseAll();
    // Managed: closes owned Chrome. CDP: does NOT close external Chrome.
    await browser.shutdown();
    await heartbeat.markOffline();
  });

  try {
    await browser.launch();
    await heartbeat.setStatus('ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browser launch/connect failed.';
    console.error('[agent-worker] Browser start failed:', message);
    await heartbeat.markOffline(message);
    process.exit(1);
  }

  await loop.start();
}

main().catch(error => {
  console.error('[agent-worker] Fatal:', error);
  process.exit(1);
});
