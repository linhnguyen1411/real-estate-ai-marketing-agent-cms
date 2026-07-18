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
import { buildAgentRegistryMetadata } from '../modules/control-plane/agentRegistry';
import { emitRuntimeEventAsync } from '../modules/control-plane/runtimeEventBus';
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

  const buildRuntimeMetadata = () => {
    const mem = process.memoryUsage();
    const slots = executionPool.snapshot();
    const browsers = browserPool.snapshot();
    const caps = ['scan', 'publish', 'browser'] as Array<
      'scan' | 'publish' | 'messaging' | 'comment' | 'browser' | 'cdp'
    >;
    for (const s of slots) {
      if (s.kind === 'messaging' && s.maxConcurrency > 0) caps.push('messaging');
      if (s.kind === 'comment' && s.maxConcurrency > 0) caps.push('comment');
    }
    if (config.browserMode === 'cdp') caps.push('cdp');

    return {
      ...buildBrowserSessionMetadata(config),
      ...buildAgentRegistryMetadata({
        workerId: config.workerId,
        browserMode: config.browserMode,
        capabilities: [...new Set(caps)],
      }),
      executionPool: slots,
      browserPool: browsers,
      resources: browser.getResourceDiagnostics(),
      process: {
        pid: process.pid,
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        uptimeSec: Math.round(process.uptime()),
      },
      publishedAt: new Date().toISOString(),
    };
  };

  await heartbeat.register(() => browser.currentUrl(), buildRuntimeMetadata);

  registerGracefulShutdown(async signal => {
    loop.stop();
    await loop.releaseCurrentJob(`Worker shutdown (${signal})`);
    browserPool.releaseAll();
    executionPool.releaseAll();
    // Managed: closes owned Chrome. CDP: does NOT close external Chrome.
    await browser.shutdown();
    await heartbeat.markOffline();
    emitRuntimeEventAsync({
      type: 'AGENT_OFFLINE',
      agentId: config.workerId,
      companyId: config.companyId,
      entityType: 'agent',
      entityId: config.workerId,
      payload: { signal },
    });
  });

  try {
    await browser.launch();
    await heartbeat.setStatus('ready');
    emitRuntimeEventAsync({
      type: 'AGENT_ONLINE',
      agentId: config.workerId,
      companyId: config.companyId,
      entityType: 'agent',
      entityId: config.workerId,
      payload: { hostname: process.env.COMPUTERNAME || process.env.HOSTNAME || null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browser launch/connect failed.';
    console.error('[agent-worker] Browser start failed:', message);
    await heartbeat.markOffline(message);
    emitRuntimeEventAsync({
      type: 'AGENT_OFFLINE',
      agentId: config.workerId,
      companyId: config.companyId,
      entityType: 'agent',
      entityId: config.workerId,
      payload: { error: message },
    });
    process.exit(1);
  }

  await loop.start();
}

main().catch(error => {
  console.error('[agent-worker] Fatal:', error);
  process.exit(1);
});
