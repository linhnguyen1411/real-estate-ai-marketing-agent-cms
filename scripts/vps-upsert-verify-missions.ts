/**
 * Run on VPS: upsert [VERIFY] missions from fixture JSON.
 * Usage: node --import tsx scripts/vps-upsert-verify-missions.ts /tmp/fixture.json
 * Or compiled: npx tsx /tmp/vps-upsert-verify-missions.ts /tmp/fixture.json
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error('Usage: tsx vps-upsert-verify-missions.ts <fixture.json>');
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
  session: string;
  companyId: string;
  missions: Array<{
    id: string;
    name: string;
    templateKey: string;
    pipeline: object;
  }>;
  runs?: Array<{
    id: string;
    missionId: string;
    pipelineHash: string;
    pipeline: object;
  }>;
};

async function main() {
  for (const m of fixture.missions) {
    await prisma.agentMission.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        companyId: fixture.companyId,
        name: m.name,
        objective: `[VERIFY] Dual-host ${fixture.session}`,
        status: 'paused',
        templateKey: m.templateKey,
        pipeline: m.pipeline,
        pipelineVersion: 1,
        rules: {
          verification: true,
          verificationSessionId: fixture.session,
          templateId: m.templateKey,
        },
        schedule: { cadence: 'manual', timezone: 'Asia/Ho_Chi_Minh' },
      },
      update: {
        name: m.name,
        pipeline: m.pipeline,
        status: 'paused',
        rules: {
          verification: true,
          verificationSessionId: fixture.session,
          templateId: m.templateKey,
        },
      },
    });
  }

  for (const run of fixture.runs || []) {
    await prisma.agentMissionRun.upsert({
      where: { id: run.id },
      create: {
        id: run.id,
        companyId: fixture.companyId,
        missionId: run.missionId,
        missionVersion: 1,
        pipelineSnapshot: run.pipeline,
        pipelineHash: run.pipelineHash,
        status: 'queued',
        triggerType: 'sync',
        triggeredBy: 'dual-host-verify',
        metrics: {},
      },
      update: {
        pipelineSnapshot: run.pipeline,
        pipelineHash: run.pipelineHash,
      },
    });
  }

  console.log(
    JSON.stringify({
      ok: true,
      session: fixture.session,
      missions: fixture.missions.length,
      runs: (fixture.runs || []).length,
    }),
  );
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
