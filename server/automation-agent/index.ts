/**
 * Execution Agent — independent process (Execution Node).
 *
 * npm run automation-agent
 *
 * Responsibilities: register · heartbeat · poll · claim · execute · report · release
 * No business logic. Queue/heartbeat via Runtime API only.
 *
 * Browser Pool + Execution Pool run in-process on the agent.
 * Job handlers are injected adapters (existing scan/publish modules unchanged).
 */

import 'dotenv/config';
// G1 — Stateless Execution Agent: no DATABASE_URL required.
process.env.EXECUTION_AGENT_STATELESS = process.env.EXECUTION_AGENT_STATELESS || '1';

import os from 'os';
import { BrowserManager } from '../agent-worker/browserManager';
import { loadWorkerConfig } from '../agent-worker/config';
import { registerGracefulShutdown } from '../agent-worker/gracefulShutdown';
import { createDefaultJobHandlerRegistry } from '../agent-worker/defaultHandlers';
import { BrowserPool, ExecutionPool } from '../agent-worker/runtime';
import { WorkerLoop } from '../agent-worker/workerLoop';
import { buildAgentRegistryMetadata } from '../modules/control-plane/agentRegistry';
import { createHttpJobQueuePort } from './httpJobQueue';
import { HttpAgentHeartbeat } from './httpHeartbeat';
import { RuntimeAgentClient } from './runtimeClient';
import { buildExecutionTelemetryMetadata } from './telemetryCollector';

function runtimeBaseUrl(): string {
  return (
    process.env.AGENT_RUNTIME_URL?.trim() ||
    process.env.CMS_BASE_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT || 3000}`
  );
}

function runtimeToken(): string {
  return (
    process.env.AGENT_RUNTIME_TOKEN?.trim() ||
    process.env.AGENT_WORKER_TOKEN?.trim() ||
    'dev-runtime-token'
  );
}

function parseCapabilities(): string[] {
  const raw = process.env.AGENT_CAPABILITIES?.trim();
  if (raw) {
    return raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  }
  return ['scan', 'publish', 'browser'];
}

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const capabilities = parseCapabilities();
  const client = new RuntimeAgentClient({
    baseUrl: runtimeBaseUrl(),
    token: runtimeToken(),
  });

  console.log('[automation-agent] Starting Execution Agent');
  console.log(`  agentId:      ${config.workerId}`);
  console.log(`  runtimeUrl:   ${runtimeBaseUrl()}`);
  console.log(`  capabilities: ${capabilities.join(', ')}`);
  console.log(`  browserMode:  ${config.browserMode}`);

  const browser = new BrowserManager(config);
  const executionPool = new ExecutionPool();
  const browserPool = new BrowserPool(browser, config);
  const handlers = createDefaultJobHandlerRegistry();
  const queue = createHttpJobQueuePort(client, config.workerId);

  const buildMetadata = () => {
    const mem = process.memoryUsage();
    const processMeta = {
      pid: process.pid,
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      uptimeSec: Math.round(process.uptime()),
    };
    const registry = buildAgentRegistryMetadata({
      workerId: config.workerId,
      browserMode: config.browserMode,
      capabilities: capabilities as never,
    });
    const telemetry = buildExecutionTelemetryMetadata({
      agentId: config.workerId,
      version: String(registry.version || ''),
      hostname: os.hostname(),
      browserPool: browserPool.snapshot(),
      executionPool: executionPool.snapshot(),
      resources: browser.getResourceDiagnostics(),
      process: processMeta,
    });
    return {
      ...registry,
      ...telemetry,
      mode: config.browserMode,
      profilePath: config.profileDir,
      executionPool: executionPool.snapshot(),
      browserPool: browserPool.snapshot(),
      publishedAt: new Date().toISOString(),
      executionAgent: true,
    };
  };

  const heartbeat = new HttpAgentHeartbeat(
    client,
    config.workerId,
    config.heartbeatIntervalMs,
    buildMetadata,
    () => browser.currentUrl(),
    async cmds => {
      for (const cmd of cmds) {
        const action = String(cmd.action || '');
        try {
          if (action === 'release_browser' || action === 'browser_release') {
            browserPool.releaseAll();
            console.log(`[automation-agent] OPS release_browser ${cmd.id}`);
          } else if (action === 'restart_browser' || action === 'browser_recover') {
            browserPool.releaseAll();
            await browser.shutdown().catch(() => undefined);
            await browser.launch();
            console.log(`[automation-agent] OPS restart_browser ${cmd.id}`);
          } else if (action === 'refresh_runtime') {
            console.log(`[automation-agent] OPS refresh_runtime ${cmd.id}`);
          } else if (action === 'restart_agent') {
            console.log(`[automation-agent] OPS restart_agent ${cmd.id} — exiting for process manager`);
            process.exit(0);
          } else {
            console.log(`[automation-agent] OPS ignored action=${action} id=${cmd.id}`);
          }
        } catch (err) {
          console.warn(
            `[automation-agent] OPS failed action=${action}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    },
  );

  // Recovery before register
  try {
    const reclaimed = await client.reclaim({
      agentId: config.workerId,
      staleMs: 60_000,
    });
    if (reclaimed.reclaimed > 0) {
      console.log(`[automation-agent] Reclaimed ${reclaimed.reclaimed} orphaned job(s)`);
    }
  } catch (err) {
    console.warn(
      '[automation-agent] Reclaim skipped:',
      err instanceof Error ? err.message : err,
    );
  }

  await heartbeat.register();
  console.log(`[automation-agent] Registered session=${heartbeat.getSessionId()}`);

  const loop = new WorkerLoop(config, browser, executionPool, browserPool, {
    queue,
    handlers,
    capabilities,
  });

  registerGracefulShutdown(async signal => {
    loop.stop();
    await loop.releaseCurrentJob(`Execution Agent shutdown (${signal})`);
    browserPool.releaseAll();
    executionPool.releaseAll();
    await browser.shutdown();
    await heartbeat.markOffline(`shutdown:${signal}`);
  });

  try {
    await browser.launch();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browser launch failed';
    console.error('[automation-agent] Browser start failed:', message);
    await heartbeat.markOffline(message);
    process.exit(1);
  }

  await loop.start();
}

main().catch(error => {
  console.error('[automation-agent] Fatal:', error);
  process.exit(1);
});
