#!/usr/bin/env tsx
/**
 * npm run mission:recover-stale-runs
 * Dry-run by default. Pass --apply to mutate.
 */
import { recoverStaleMissionRuns } from '../server/modules/mission-engine/application/workflowRecoveryService';

async function main() {
  const apply = process.argv.includes('--apply');
  const result = await recoverStaleMissionRuns({ dryRun: !apply });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to recover.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
