#!/usr/bin/env node
/**
 * Ten sequential scan jobs stability harness.
 *
 * Usage:
 *   npm run agent:stress-10jobs -- --snapshot
 *   npm run agent:stress-10jobs -- --run --source-id=xxx [--count=10] [--idle-ms=600000]
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prisma = new PrismaClient();

function parseArgs(argv) {
  let run = false;
  let sourceId = null;
  let count = 10;
  let idleMs = 600_000;
  for (const a of argv) {
    if (a === '--run') run = true;
    if (a === '--snapshot') run = false;
    if (a.startsWith('--source-id=')) sourceId = a.split('=')[1];
    if (a.startsWith('--count=')) count = Math.max(1, Number(a.split('=')[1]) || 10);
    if (a.startsWith('--idle-ms=')) idleMs = Math.max(0, Number(a.split('=')[1]) || 0);
  }
  return { run, sourceId, count, idleMs };
}

function chromeStats() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "$p=Get-Process chrome -EA SilentlyContinue; if($p){[math]::Round(($p|Measure-Object WorkingSet -Sum).Sum/1MB,1).ToString()+'|'+$p.Count}else{'0|0'}"`,
      { encoding: 'utf8' },
    ).trim();
    const [rss, count] = out.split('|');
    return { chromeRssMb: Number(rss) || 0, chromeProcessCount: Number(count) || 0 };
  } catch {
    return { chromeRssMb: null, chromeProcessCount: null };
  }
}

function workerRssFromSessions(sessions) {
  const ready = sessions.find((s) => s.status === 'ready') || sessions[0];
  if (!ready?.workerId) return { workerPid: null, workerRssMb: null };
  const m = String(ready.workerId).match(/-(\d+)$/);
  const pid = m ? Number(m[1]) : null;
  if (!pid) return { workerPid: null, workerRssMb: null };
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-Process -Id ${pid} -EA SilentlyContinue).WorkingSet64"`,
      { encoding: 'utf8' },
    ).trim();
    const n = Number(out);
    return { workerPid: pid, workerRssMb: Number.isFinite(n) ? Math.round(n / 1e6) : null };
  } catch {
    return { workerPid: pid, workerRssMb: null };
  }
}

function dirSizeMb(rel) {
  const abs = path.resolve(ROOT, rel);
  if (!fs.existsSync(abs)) return { missing: true, mb: 0 };
  let bytes = 0;
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      try {
        const st = fs.lstatSync(p);
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) walk(p);
        else bytes += st.size;
      } catch {
        /* skip */
      }
    }
  };
  walk(abs);
  return { missing: false, mb: Math.round((bytes / 1e6) * 10) / 10 };
}

async function snapshot(label, lastJob = null) {
  const sessions = await prisma.browserSession.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  const readySessions = sessions.filter((s) => s.status === 'ready');
  const workerMem = workerRssFromSessions(readySessions.length ? readySessions : sessions);
  const chrome = chromeStats();
  const meta = readySessions[0]?.metadata && typeof readySessions[0].metadata === 'object'
    ? readySessions[0].metadata
    : {};
  const result = lastJob?.result && typeof lastJob.result === 'object' ? lastJob.result : {};
  const row = {
    label,
    at: new Date().toISOString(),
    worker: workerMem,
    chrome,
    session: readySessions[0]
      ? {
          workerId: readySessions[0].workerId,
          status: readySessions[0].status,
          lastHeartbeatAt: readySessions[0].lastHeartbeatAt,
          metadata: meta,
        }
      : null,
    lastJob: lastJob
      ? {
          id: lastJob.id,
          status: lastJob.status,
          browserPageMode: result.browserPageMode ?? null,
          contextPageCount: result.contextPageCount ?? null,
          scanMetrics: result.scanMetrics ?? null,
          resourceDiagnostics: result.resourceDiagnostics ?? null,
          stopReason: result.stopReason ?? null,
          durationMs: result.durationMs ?? null,
        }
      : null,
    counts: {
      queued: await prisma.agentJob.count({ where: { status: 'queued' } }),
      running: await prisma.agentJob.count({ where: { status: 'running' } }),
      pendingOutbox: await prisma.agentSyncOutbox.count({ where: { status: 'pending' } }),
      failedOutbox: await prisma.agentSyncOutbox.count({ where: { status: 'failed' } }),
    },
    profileMb: dirSizeMb(process.env.AGENT_BROWSER_PROFILE_DIR || './runtime/agent-browser-profile'),
    legacyProfileMb: dirSizeMb('data/browser-profiles'),
  };
  console.log(JSON.stringify(row, null, 2));
  return row;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rows = [];
  rows.push(await snapshot('before'));

  if (!opts.run) {
    const outPath = path.join(ROOT, 'docs/refactor/_r0-memory-raw.json');
    fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
    console.log('Wrote', outPath);
    await prisma.$disconnect();
    return;
  }

  let source = null;
  if (opts.sourceId) {
    source = await prisma.agentSource.findUnique({ where: { id: opts.sourceId } });
  } else {
    source = await prisma.agentSource.findFirst({
      where: { status: 'active', type: { in: ['facebook_group', 'facebook', 'facebook_page'] } },
      orderBy: { updatedAt: 'desc' },
    });
  }
  if (!source) {
    console.error('No Facebook source found');
    await prisma.$disconnect();
    process.exit(2);
  }

  const active = await prisma.agentJob.count({
    where: { sourceId: source.id, status: { in: ['queued', 'running'] } },
  });
  if (active > 0) {
    console.error(`Source ${source.id} already has ${active} active jobs — abort`);
    await prisma.$disconnect();
    process.exit(3);
  }

  const prevNext = source.nextScanAt;
  await prisma.agentSource.update({
    where: { id: source.id },
    data: { nextScanAt: new Date(Date.now() + 24 * 60 * 60_000) },
  });

  console.log(`Enqueue ${opts.count} sequential jobs for ${source.id} (${source.name})`);
  try {
    for (let i = 0; i < opts.count; i++) {
      const job = await prisma.agentJob.create({
        data: {
          companyId: source.companyId,
          sourceId: source.id,
          type: 'scan_source',
          status: 'queued',
          priority: 1,
          payload: {
            sourceId: source.id,
            enqueuedAt: new Date().toISOString(),
            triggeredBy: 'r0-stress-10jobs',
            seq: i + 1,
          },
          availableAt: new Date(),
        },
      });

      const deadline = Date.now() + 12 * 60_000;
      let done = null;
      while (Date.now() < deadline) {
        const j = await prisma.agentJob.findUnique({ where: { id: job.id } });
        if (j && ['completed', 'failed', 'cancelled'].includes(j.status)) {
          done = j;
          const res = (j.result && typeof j.result === 'object' ? j.result : {}) as Record<
            string,
            unknown
          >;
          console.log(
            `job ${i + 1}/${opts.count} ${j.status} mode=${res.browserPageMode ?? '?'} pages=${res.contextPageCount ?? '?'}`,
          );
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!done) {
        console.error(`Job ${job.id} timed out still running`);
        rows.push(await snapshot(`timeout_job_${i + 1}`));
        break;
      }
      if (i === 0) rows.push(await snapshot('after_job_1', done));
      if (i === 4) rows.push(await snapshot('after_job_5', done));
      if (i === opts.count - 1) rows.push(await snapshot('after_job_10', done));
    }

    console.log(`Idle ${opts.idleMs}ms …`);
    await new Promise((r) => setTimeout(r, opts.idleMs));
    rows.push(await snapshot('idle_10m'));
  } finally {
    await prisma.agentSource.update({
      where: { id: source.id },
      data: { nextScanAt: prevNext },
    });
  }

  const outPath = path.join(ROOT, 'docs/refactor/_r0-memory-raw.json');
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log('Wrote', outPath);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
