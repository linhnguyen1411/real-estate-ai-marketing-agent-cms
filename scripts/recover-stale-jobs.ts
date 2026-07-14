#!/usr/bin/env node
/**
 * agent:recover-stale-jobs — dry-run by default.
 *
 * Usage:
 *   npm run agent:recover-stale-jobs
 *   npm run agent:recover-stale-jobs -- --older-than-minutes=30
 *   npm run agent:recover-stale-jobs -- --apply --action=fail
 *   npm run agent:recover-stale-jobs -- --apply --job-id=xxx --action=requeue
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv) {
  let apply = false;
  let olderThanMinutes = 30;
  let jobId = null;
  let action = 'fail'; // requeue | fail | cancel
  for (const a of argv) {
    if (a === '--apply') apply = true;
    else if (a.startsWith('--older-than-minutes=')) olderThanMinutes = Math.max(1, Number(a.split('=')[1]) || 30);
    else if (a.startsWith('--job-id=')) jobId = a.split('=')[1];
    else if (a.startsWith('--action=')) action = a.split('=')[1];
    else if (a === '--help') {
      console.log('recover-stale-jobs [--apply] [--older-than-minutes=N] [--job-id=ID] [--action=fail|requeue|cancel]');
      process.exit(0);
    }
  }
  if (!['fail', 'requeue', 'cancel'].includes(action)) {
    console.error('Invalid --action');
    process.exit(1);
  }
  return { apply, olderThanMinutes, jobId, action };
}

function classifyJob(job, sessionsByWorker, olderThanMinutes) {
  const ageMs = Date.now() - new Date(job.startedAt || job.claimedAt || job.updatedAt).getTime();
  const ageMin = ageMs / 60_000;
  const workerId = job.claimedBy || '';
  const session = sessionsByWorker.get(workerId) || null;
  const heartbeatAt = session?.lastHeartbeatAt ? new Date(session.lastHeartbeatAt).getTime() : null;
  const heartbeatAgeMin = heartbeatAt != null ? (Date.now() - heartbeatAt) / 60_000 : null;
  const sessionOffline = !session || session.status === 'offline';
  const heartbeatStale = heartbeatAgeMin == null || heartbeatAgeMin > olderThanMinutes;

  let kind = 'unknown';
  const reasons = [];
  if (ageMin < olderThanMinutes && session && session.status === 'ready' && !heartbeatStale) {
    kind = 'valid';
    reasons.push('within lease and session ready with fresh heartbeat');
  } else if (sessionOffline || heartbeatStale || ageMin >= olderThanMinutes) {
    kind = 'stale';
    if (sessionOffline) reasons.push('browser session missing/offline for claimedBy');
    if (heartbeatStale) reasons.push(`heartbeat stale (${heartbeatAgeMin == null ? 'none' : heartbeatAgeMin.toFixed(1) + 'm'})`);
    if (ageMin >= olderThanMinutes) reasons.push(`running older than ${olderThanMinutes}m (age=${ageMin.toFixed(1)}m)`);
  } else {
    reasons.push('insufficient evidence');
  }

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    sourceId: job.sourceId,
    missionId: job.missionId,
    claimedBy: job.claimedBy,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt,
    claimedAt: job.claimedAt,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    ageMinutes: Number(ageMin.toFixed(2)),
    sessionStatus: session?.status ?? null,
    heartbeatAgeMinutes: heartbeatAgeMin == null ? null : Number(heartbeatAgeMin.toFixed(2)),
    kind,
    reasons,
    payload: job.payload,
    lastError: job.errorMessage,
  };
}

async function hasOtherActiveJob(sourceId, excludeJobId) {
  if (!sourceId) return false;
  const n = await prisma.agentJob.count({
    where: {
      sourceId,
      id: { not: excludeJobId },
      status: { in: ['queued', 'running'] },
    },
  });
  return n > 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const where = {
    status: 'running',
    ...(opts.jobId ? { id: opts.jobId } : {}),
  };
  const jobs = await prisma.agentJob.findMany({ where, orderBy: { updatedAt: 'asc' } });
  const sessions = await prisma.browserSession.findMany();
  const sessionsByWorker = new Map(sessions.map((s) => [s.workerId, s]));

  const classified = jobs.map((j) => classifyJob(j, sessionsByWorker, opts.olderThanMinutes));
  const stale = classified.filter((j) => j.kind === 'stale');
  const valid = classified.filter((j) => j.kind === 'valid');
  const unknown = classified.filter((j) => j.kind === 'unknown');

  console.log(
    JSON.stringify(
      {
        mode: opts.apply ? 'APPLY' : 'DRY-RUN',
        olderThanMinutes: opts.olderThanMinutes,
        action: opts.action,
        totals: { running: classified.length, stale: stale.length, valid: valid.length, unknown: unknown.length },
        jobs: classified,
      },
      null,
      2,
    ),
  );

  if (!opts.apply) {
    console.log('\nRe-run with --apply to mutate stale jobs only.');
    await prisma.$disconnect();
    return;
  }

  const results = [];
  for (const row of stale) {
    if (opts.jobId && row.id !== opts.jobId) continue;

    if (opts.action === 'requeue') {
      if (await hasOtherActiveJob(row.sourceId, row.id)) {
        results.push({ id: row.id, skipped: true, reason: 'other active job for source' });
        continue;
      }
      const nextAttempts = (row.attempts || 0) + 1;
      if (nextAttempts >= (row.maxAttempts || 3)) {
        await prisma.agentJob.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            attempts: nextAttempts,
            finishedAt: new Date(),
            errorMessage: `stale_running_max_attempts: ${row.reasons.join('; ')}`,
            claimedBy: null,
            claimedAt: null,
            result: {
              recoveredAt: new Date().toISOString(),
              recoveryAction: 'fail_max_attempts',
              reasons: row.reasons,
            },
          },
        });
        results.push({ id: row.id, action: 'failed_max_attempts' });
      } else {
        await prisma.agentJob.update({
          where: { id: row.id },
          data: {
            status: 'queued',
            attempts: nextAttempts,
            availableAt: new Date(Date.now() + 5_000),
            claimedBy: null,
            claimedAt: null,
            startedAt: null,
            errorMessage: `stale_requeued: ${row.reasons.join('; ')}`,
            result: {
              recoveredAt: new Date().toISOString(),
              recoveryAction: 'requeue',
              reasons: row.reasons,
            },
          },
        });
        results.push({ id: row.id, action: 'requeued', attempts: nextAttempts });
      }
    } else if (opts.action === 'cancel') {
      await prisma.agentJob.update({
        where: { id: row.id },
        data: {
          status: 'cancelled',
          finishedAt: new Date(),
          errorMessage: `stale_cancelled: ${row.reasons.join('; ')}`,
          claimedBy: null,
          claimedAt: null,
          result: {
            recoveredAt: new Date().toISOString(),
            recoveryAction: 'cancel',
            reasons: row.reasons,
          },
        },
      });
      results.push({ id: row.id, action: 'cancelled' });
    } else {
      await prisma.agentJob.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorMessage: `stale_running: ${row.reasons.join('; ')}`,
          claimedBy: null,
          claimedAt: null,
          result: {
            recoveredAt: new Date().toISOString(),
            recoveryAction: 'fail',
            reasons: row.reasons,
          },
        },
      });
      results.push({ id: row.id, action: 'failed' });
    }
  }

  console.log('APPLIED', JSON.stringify(results, null, 2));
  const runningAfter = await prisma.agentJob.count({ where: { status: 'running' } });
  console.log('runningJobsAfter=', runningAfter);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
