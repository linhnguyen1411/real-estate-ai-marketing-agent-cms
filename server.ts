import 'dotenv/config';
import { execSync } from 'node:child_process';
import type { Server } from 'node:http';
import { ensureDatabaseReady, readDatabase, updateSettings } from './server/dbHelper';
import { createApp } from './server/bootstrap/createApp';
import { mountRoutes } from './server/bootstrap/mountRoutes';
import {
  registerSpaFallback,
  registerSitemapXmlRoutes,
  setupViteDevServer,
} from './server/modules/public-site/seoPublicRoutes';
import { syncSiteSeoKeywords } from './server/modules/public-site/seoKeywords';
import { startAgentScheduler, stopAgentScheduler } from './server/agent/agentScheduler';
import {
  startAgentSyncOutboxWorker,
  stopAgentSyncOutboxWorker,
} from './server/agentSync/outboxWorker';
import {
  startTelegramControlPlane,
  stopTelegramControlPlane,
} from './server/modules/control-plane';

/** Env truthy when unset uses `defaultWhenUnset` (production-safe defaults). */
function envFlagEnabled(name: string, defaultWhenUnset: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return defaultWhenUnset;
  const v = String(raw).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

const FACEBOOK_GRAPH_LEGACY_ENABLED = envFlagEnabled('FACEBOOK_GRAPH_LEGACY_ENABLED', true);
const AGENT_ENABLED = envFlagEnabled('AGENT_ENABLED', true);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp({ facebookGraphLegacyEnabled: FACEBOOK_GRAPH_LEGACY_ENABLED });
mountRoutes(app, {
  facebookGraphLegacyEnabled: FACEBOOK_GRAPH_LEGACY_ENABLED,
  agentEnabled: AGENT_ENABLED,
});
// Sitemap/XML must register BEFORE static middleware + SPA wildcard (`registerSpaFallback`).
registerSitemapXmlRoutes(app);
registerSpaFallback(app);

function freeDevPortsSync() {
  if (process.env.SKIP_FREE_DEV_PORTS === '1' || process.env.SKIP_FREE_DEV_PORTS === 'true') {
    return;
  }
  try {
    execSync('node scripts/free-dev-ports.mjs', { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    /* best effort */
  }
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function listenHttpServer(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      console.log('====================================================');
      console.log(`Real Estate AI CMS is listening on port ${PORT} (PostgreSQL)`);
      console.log(`Live Preview at: http://localhost:${PORT}`);
      console.log('====================================================');
      resolve(server);
    });
    server.on('error', (error: NodeJS.ErrnoException) => reject(error));
  });
}

async function startHttpServerWithRetry() {
  try {
    await listenHttpServer();
    return;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (process.env.NODE_ENV === 'production' || err.code !== 'EADDRINUSE') {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${PORT} đang được dùng. Chạy: npm run dev:restart`);
      } else {
        console.error('[Server] Không khởi động được HTTP:', err);
      }
      process.exit(1);
    }
    console.warn(`[Server] Port ${PORT} bận — giải phóng và thử lại...`);
    freeDevPortsSync();
    await sleep(1000);
    try {
      await listenHttpServer();
    } catch (retryError) {
      const retryErr = retryError as NodeJS.ErrnoException;
      console.error(
        `[Server] Vẫn không bind được port ${PORT}. Chạy: npm run dev:restart`,
        retryErr.message || retryErr,
      );
      process.exit(1);
    }
  }
}

async function bootstrap(): Promise<boolean> {
  try {
    await ensureDatabaseReady();
  } catch (error) {
    console.error('[DB] Không kết nối được PostgreSQL:', error);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    console.warn('[DB] Dev mode: tiếp tục chạy UI — bật Postgres: npm run db:pg-start');
    return false;
  }

  try {
    const keywords = syncSiteSeoKeywords(readDatabase());
    await updateSettings({ seo_keywords: keywords });
  } catch (error) {
    console.warn('[DB] Bỏ qua sync seo_keywords lúc khởi động:', error);
  }

  console.log('[DB] PostgreSQL sẵn sàng');
  return true;
}

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    freeDevPortsSync();
    await sleep(400);
  }

  const dbReady = await bootstrap();

  if (dbReady) {
    if (AGENT_ENABLED) {
      startAgentScheduler();
      startAgentSyncOutboxWorker();
      void startTelegramControlPlane().then(r => {
        if (r.started) {
          console.log('[telegram-console] Control Plane client ready', r.status);
        } else {
          console.log(`[telegram-console] not started (${r.reason || 'disabled'})`);
        }
      });
      void import('./server/modules/control-plane/operations').then(ops => {
        ops.startMetricsCollector();
        console.log('[metrics-collector] Operations Center metrics started (5m + event/manual)');
      }).catch(err => {
        console.warn('[metrics-collector] failed to start', err instanceof Error ? err.message : err);
      });
    } else {
      console.warn('[agent] Scheduler/outbox worker skipped (AGENT_ENABLED=false)');
    }
  } else {
    console.warn('[agent-scheduler] Bỏ qua — DB chưa sẵn sàng');
  }

  const shutdown = (signal: string) => {
    console.log(`[Server] ${signal} — stopping scheduler…`);
    stopAgentScheduler();
    stopAgentSyncOutboxWorker();
    void stopTelegramControlPlane();
    void import('./server/modules/control-plane/operations')
      .then(ops => ops.stopMetricsCollector())
      .catch(() => undefined);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  if (process.env.NODE_ENV === 'production') {
    await startHttpServerWithRetry();
    return;
  }

  try {
    await setupViteDevServer(app);
    await startHttpServerWithRetry();
  } catch (error) {
    console.error('Vite server fails construction:', error);
    process.exit(1);
  }
}

void main();
