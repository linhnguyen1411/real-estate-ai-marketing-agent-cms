#!/usr/bin/env node
/**
 * agent:diagnose-runtime — snapshot worker/process/resource metrics.
 * Does not print secrets.
 *
 * Usage: npm run agent:diagnose-runtime
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return 'n/a';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function dirSize(abs) {
  if (!fs.existsSync(abs)) return { bytes: 0, files: 0, missing: true };
  let bytes = 0;
  let files = 0;
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      let st;
      try {
        st = fs.lstatSync(p);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) {
        bytes += st.size;
        files += 1;
      }
    }
  };
  walk(abs);
  return { bytes, files, missing: false };
}

function maskUrl(u) {
  if (!u) return null;
  try {
    const x = new URL(u);
    if (x.password) x.password = '***';
    if (x.username) x.username = `${x.username.slice(0, 2)}***`;
    return x.toString().replace(/([?&](secret|token|key|password)=)[^&]*/gi, '$1***');
  } catch {
    return '[unparseable]';
  }
}

async function tryPrismaMetrics() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const started = Date.now();
    const [pendingOutbox, failedOutbox, queuedJobs, runningJobs, offlineSessions] =
      await Promise.all([
        prisma.agentSyncOutbox.count({ where: { status: 'pending' } }).catch(() => -1),
        prisma.agentSyncOutbox.count({ where: { status: 'failed' } }).catch(() => -1),
        prisma.agentJob.count({ where: { status: 'queued' } }).catch(() => -1),
        prisma.agentJob.count({ where: { status: 'running' } }).catch(() => -1),
        prisma.browserSession.count({ where: { status: 'offline' } }).catch(() => -1),
      ]);
    await prisma.$disconnect().catch(() => undefined);
    return {
      ok: true,
      queryMs: Date.now() - started,
      pendingOutbox,
      failedOutbox,
      queuedJobs,
      runningJobs,
      offlineSessions,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 160) };
  }
}

function nodeSelfMetrics() {
  const mem = process.memoryUsage();
  let handles = null;
  let requests = null;
  try {
    handles = process._getActiveHandles?.()?.length ?? null;
  } catch {
    handles = null;
  }
  try {
    requests = process._getActiveRequests?.()?.length ?? null;
  } catch {
    requests = null;
  }
  return {
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    activeHandles: handles,
    activeRequests: requests,
  };
}

function loadEnvHints() {
  const keys = [
    'AGENT_ENABLED',
    'AGENT_SCHEDULER_ENABLED',
    'AGENT_LOCAL_SYNC_ENABLED',
    'AGENT_TELEGRAM_ENABLED',
    'AGENT_INGEST_ENABLED',
    'AGENT_BROWSER_MODE',
    'AGENT_CDP_ENDPOINT',
    'AGENT_BROWSER_PROFILE_DIR',
    'AGENT_WORKER_ID',
  ];
  const out = {};
  for (const k of keys) {
    const v = process.env[k];
    out[k] = v == null || v === '' ? null : v;
  }
  out.DATABASE_URL = maskUrl(process.env.DATABASE_URL);
  return out;
}

async function main() {
  try {
    require('dotenv').config({ path: path.join(ROOT, '.env') });
  } catch {
    /* optional */
  }

  const profileRel = process.env.AGENT_BROWSER_PROFILE_DIR || './runtime/agent-browser-profile';
  const profileAbs = path.resolve(ROOT, profileRel);
  const legacyProfile = path.join(ROOT, 'data', 'browser-profiles');
  const profileSize = dirSize(profileAbs);
  const legacySize = dirSize(legacyProfile);
  let logBytes = 0;
  let logFiles = 0;
  for (const d of [path.join(ROOT, 'runtime', 'logs'), path.join(ROOT, 'logs')]) {
    const s = dirSize(d);
    logBytes += s.bytes;
    logFiles += s.files;
  }

  const db = await tryPrismaMetrics();
  const self = nodeSelfMetrics();

  const report = {
    timestamp: new Date().toISOString(),
    diagnoseScriptPid: self.pid,
    labeledWorkerPid: process.env.AGENT_DIAGNOSE_PID || null,
    note: 'Node metrics are for this diagnose process. Use OS tools for live worker/Chrome PIDs.',
    node: {
      uptimeSec: self.uptimeSec,
      rss: formatBytes(self.rss),
      heapUsed: formatBytes(self.heapUsed),
      heapTotal: formatBytes(self.heapTotal),
      external: formatBytes(self.external),
      activeHandles: self.activeHandles,
      activeRequests: self.activeRequests,
    },
    browser: {
      profileDir: path.relative(ROOT, profileAbs).split(path.sep).join('/') || '.',
      profileSize: formatBytes(profileSize.bytes),
      profileFiles: profileSize.files,
      profileMissing: profileSize.missing,
      legacyProfileDir: 'data/browser-profiles',
      legacyProfileSize: formatBytes(legacySize.bytes),
      pages: 'n/a (see worker BrowserManager.scanMetrics)',
      contexts: 'n/a',
    },
    database: db,
    logs: { size: formatBytes(logBytes), files: logFiles },
    envFlags: loadEnvHints(),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.message || e) }));
  process.exit(1);
});
