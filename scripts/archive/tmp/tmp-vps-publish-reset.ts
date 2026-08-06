/**
 * VPS ops: purge failed/cancelled publish + scan jobs, reset drafts, enable scheduler.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const p = new PrismaClient();
const envPath = path.join(process.cwd(), '.env');

async function main() {
  let env = fs.readFileSync(envPath, 'utf8');
  if (/^AGENT_SCHEDULER_ENABLED=/m.test(env)) {
    env = env.replace(/^AGENT_SCHEDULER_ENABLED=.*/m, 'AGENT_SCHEDULER_ENABLED=true');
  } else {
    env += '\nAGENT_SCHEDULER_ENABLED=true\n';
  }
  fs.writeFileSync(envPath, env);
  console.log('ENV: AGENT_SCHEDULER_ENABLED=true');

  const orphanPublishAgent = await p.agentJob.deleteMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running', 'failed'] },
    },
  });

  const failedScan = await p.agentJob.deleteMany({
    where: {
      status: 'failed',
      type: { in: ['scan_source', 'source_scan'] },
    },
  });

  const publishJobs = await p.socialPublishJob.deleteMany({
    where: { status: { in: ['cancelled', 'failed'] } },
  });

  const draftsReset = await p.socialPostDraft.updateMany({
    where: { status: 'scheduled' },
    data: { status: 'approved' },
  });

  const stuckRuns = await p.agentMissionRun.updateMany({
    where: {
      status: { in: ['queued', 'running', 'claimed'] },
      jobs: { every: { status: { in: ['completed', 'failed', 'cancelled'] } } },
    },
    data: { status: 'cancelled', completedAt: new Date() },
  });

  console.log(
    JSON.stringify(
      {
        deletedPublishAgentJobs: orphanPublishAgent.count,
        deletedFailedScanJobs: failedScan.count,
        deletedPublishJobs: publishJobs.count,
        draftsResetToApproved: draftsReset.count,
        missionRunsCancelled: stuckRuns.count,
      },
      null,
      2,
    ),
  );

  const remaining = await p.socialPublishJob.groupBy({ by: ['status'], _count: true });
  const drafts = await p.socialPostDraft.groupBy({ by: ['status'], _count: true });
  console.log('REMAINING_PUBLISH_JOBS', remaining);
  console.log('DRAFTS', drafts);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
