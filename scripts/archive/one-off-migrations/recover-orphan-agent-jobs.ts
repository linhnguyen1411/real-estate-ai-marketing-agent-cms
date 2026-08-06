/**
 * Jobs claimed by workers with no recent ready session (orphaned after restart).
 * Dry-run default; --apply to mark failed.
 */
import { recoverOrphanAgentJobs } from '../server/agent/orphanAgentJobRecovery';
import { prisma } from '../server/prisma';

async function main() {
  const apply = process.argv.includes('--apply');
  const result = await recoverOrphanAgentJobs({ dryRun: !apply });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
