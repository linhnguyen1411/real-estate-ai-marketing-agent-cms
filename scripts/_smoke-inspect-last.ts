import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../server/prisma';
import { listPublishEvidenceForJob, getPublishEvidenceRoot } from '../server/modules/social-publishing/runtime/publishEvidenceService';

async function main() {
  const recent = await prisma.socialPublishJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      status: true,
      channelId: true,
      result: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  const root = getPublishEvidenceRoot();
  console.log('evidenceRoot', root, 'exists', fs.existsSync(root));

  for (const job of recent) {
    const dir = path.join(root, job.id);
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      entries = [];
    }
    const listed = await listPublishEvidenceForJob(job.id);
    const result = (job.result || {}) as Record<string, unknown>;
    console.log(
      JSON.stringify(
        {
          id: job.id,
          status: job.status,
          errorCode: job.errorCode,
          externalPostId: result.externalPostId,
          dryRun: result.dryRun,
          dirExists: fs.existsSync(dir),
          dirEntries: entries,
          listEvidence: listed.map(e => ({
            attemptId: e.attemptId,
            hasManifest: Boolean(e.manifest),
            files: e.files,
          })),
        },
        null,
        2,
      ),
    );
  }

  const workers = await prisma.browserSession.findMany({
    orderBy: { lastHeartbeatAt: 'desc' },
    take: 5,
    select: { workerId: true, status: true, lastHeartbeatAt: true },
  });
  console.log('sessions', JSON.stringify(workers, null, 2));

  const queued = await prisma.agentJob.findMany({
    where: { type: 'publish_social', status: { in: ['queued', 'claimed', 'running'] } },
    select: { id: true, status: true, claimedBy: true, createdAt: true, payload: true },
  });
  console.log('activePublishAgentJobs', JSON.stringify(queued, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
