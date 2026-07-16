import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const content = await p.scannedContent.findFirst({ where: { externalId: "verify_m2dh_1784165884719_buyer" } });
  const findings = content ? await p.agentFinding.count({ where: { scannedContentId: content.id } }) : 0;
  const inv = content ? await p.externalInventoryItem.count({ where: { scannedContentId: content.id } }) : 0;
  const finding = content
    ? await p.agentFinding.findFirst({
        where: { scannedContentId: content.id },
        select: { id: true, missionId: true, missionRunId: true, classification: true },
      })
    : null;
  const invItem = content
    ? await p.externalInventoryItem.findFirst({
        where: { scannedContentId: content.id },
        select: { id: true },
      })
    : null;
  const steps = await p.agentWorkflowStepRun.count({ where: { missionRunId: "cmrmuavym0004hhytpedqy9fh" } });
  const run = await p.agentMissionRun.findUnique({
    where: { id: "cmrmuavym0004hhytpedqy9fh" },
    select: { id: true, status: true },
  });
  console.log(JSON.stringify({ contentId: content?.id ?? null, findings, inv, finding, invItem, steps, run }));
}
main().finally(() => p.$disconnect());
