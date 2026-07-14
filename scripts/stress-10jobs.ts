#!/usr/bin/env node
/**
 * Ten sequential scan jobs stability harness (dry metrics + optional enqueue).
 *
 * Default: snapshot-only (--snapshot).
 * With --run: enqueue up to 10 scan_source jobs for one Facebook source and poll.
 *
 * Usage:
 *   npm run agent:stress-10jobs -- --snapshot
 *   npm run agent:stress-10jobs -- --run --source-id=xxx
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
  let snapshot = true;
  let sourceId = null;
  let count = 10;
  for (const a of argv) {
    if (a === '--run') {
      run = true;
      snapshot = false;
    }
    if (a === '--snapshot') snapshot = true;
    if (a.startsWith('--source-id=')) sourceId = a.split('=')[1];
    if (a.startsWith('--count=')) count = Math.max(1, Number(a.split('=')[1]) || 10);
  }
  return { run, snapshot, sourceId, count };
}

function chromeRssMb() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-Process chrome -EA SilentlyContinue | Measure-Object WorkingSet -Sum).Sum"',
      { encoding: 'utf8' },
    ).trim();
    return Math.round(Number(out) / 1e6);
  } catch {
    return null;
  }
}

function nodeSelf() {
  const m = process.memoryUsage();
  return {
    pid: process.pid,
    rssMb: Math.round(m.rss / 1e6),
    heapUsedMb: Math.round(m.heapUsed / 1e6),
    externalMb: Math.round(m.external / 1e6),
    handles: (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles?.()
      ?.length ?? null,
  };
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

async function snapshot(label) {
  const sessions = await prisma.browserSession.findMany({
    where: { status: 'ready' },
    orderBy: { updatedAt: 'desc' },
    take: 3,
  });
  const counts = {
    queued: await prisma.agentJob.count({ where: { status: 'queued' } }),
    running: await prisma.agentJob.count({ where: { status: 'running' } }),
    pendingOutbox: await prisma.agentSyncOutbox.count({ where: { status: 'pending' } }),
    failedOutbox: await prisma.agentSyncOutbox.count({ where: { status: 'failed' } }),
  };
  const row = {
    label,
    at: new Date().toISOString(),
    node: nodeSelf(),
    chromeRssMb: chromeRssMb(),
    profileMb: dirSizeMb(process.env.AGENT_BROWSER_PROFILE_DIR || './runtime/agent-browser-profile'),
    legacyProfileMb: dirSizeMb('data/browser-profiles'),
    browserSessions: sessions.map((s) => ({
      workerId: s.workerId,
      status: s.status,
      lastHeartbeatAt: s.lastHeartbeatAt,
      metadata: s.metadata,
    })),
    counts,
  };
  console.log(JSON.stringify(row, null, 2));
  return row;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rows = [];
  rows.push(await snapshot('before'));

  if (opts.run) {
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
      console.error('No Facebook source found — snapshot-only. Pass --source-id=...');
      await prisma.$disconnect();
      process.exit(2);
    }

    const active = await prisma.agentJob.count({
      where: { sourceId: source.id, status: { in: ['queued', 'running'] } },
    });
    if (active > 0) {
      console.error(`Source ${source.id} already has ${active} active jobs — abort enqueue`);
      await prisma.$disconnect();
      process.exit(3);
    }

    console.log(`Enqueue ${opts.count} sequential jobs for source ${source.id} (${source.name})`);
    const jobIds = [];
    for (let i = 0; i < opts.count; i++) {
      // Only enqueue next after previous completes — create one at a time
      const job = await prisma.agentJob.create({
        data: {
          companyId: source.companyId,
          sourceId: source.id,
          type: 'scan_source',
          status: 'queued',
          priority: 5,
          payload: {
            sourceId: source.id,
            enqueuedAt: new Date().toISOString(),
            triggeredBy: 'r0-stress-10jobs',
            seq: i + 1,
          },
          availableAt: new Date(),
        },
      });
      jobIds.push(job.id);
      const deadline = Date.now() + 10 * 60_000;
      while (Date.now() < deadline) {
        const j = await prisma.agentJob.findUnique({ where: { id: job.id } });
        if (j && (j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled')) {
          console.log(`job ${i + 1}/${opts.count} ${j.status}`);
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (i === 0) rows.push(await snapshot('after_job_1'));
      if (i === 4) rows.push(await snapshot('after_job_5'));
    }
    rows.push(await snapshot('after_job_10'));
    console.log('Idle 60s sample (full 10m should be recorded manually if needed)…');
    await new Promise((r) => setTimeout(r, 60_000));
    rows.push(await snapshot('idle_60s'));
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
