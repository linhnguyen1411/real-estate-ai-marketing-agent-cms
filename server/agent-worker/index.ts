import 'dotenv/config';
import { checkDatabaseConnection } from '../prisma';
import { BrowserManager } from './browserManager';
import { loadWorkerConfig } from './config';
import { registerGracefulShutdown } from './gracefulShutdown';
import { HeartbeatService } from './heartbeat';
import { WorkerLoop } from './workerLoop';
import './scanSourceHandler';

async function main(): Promise<void> {
  const config = loadWorkerConfig();

  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.error(`[agent-worker] Database unavailable: ${db.message}`);
    process.exit(1);
  }

  console.log('[agent-worker] Starting Browser Worker MVP (Sprint 3.1)');
  console.log(`  workerId:    ${config.workerId}`);
  console.log(`  profileDir:  ${config.profileDir}`);
  console.log(`  headless:    ${config.headless}`);
  console.log(`  heartbeat:   ${config.heartbeatIntervalMs}ms`);
  console.log(`  poll:        ${config.pollIntervalMs}ms`);

  const browser = new BrowserManager(config);
  const heartbeat = new HeartbeatService(config);
  const loop = new WorkerLoop(config, browser);

  await heartbeat.register(() => browser.currentUrl());

  registerGracefulShutdown(async signal => {
    loop.stop();
    await loop.releaseCurrentJob(`Worker shutdown (${signal})`);
    await browser.close();
    await heartbeat.markOffline();
  });

  try {
    await browser.launch();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không khởi động được Chromium.';
    console.error('[agent-worker] Browser launch failed:', message);
    await heartbeat.markOffline(message);
    process.exit(1);
  }

  await loop.start();
}

main().catch(error => {
  console.error('[agent-worker] Fatal:', error);
  process.exit(1);
});
