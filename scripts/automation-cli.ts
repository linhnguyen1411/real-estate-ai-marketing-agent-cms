#!/usr/bin/env node
/**
 * automation-cli — Control Plane Console CLI client.
 * Shares Command Engine with Telegram / Web.
 *
 * Usage:
 *   npx tsx scripts/automation-cli.ts runtime
 *   npx tsx scripts/automation-cli.ts report today
 *   npm run automation-cli -- missions
 */
import 'dotenv/config';
import {
  executeControlCommand,
  formatCommandText,
} from '../server/modules/control-plane/command-engine';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    const help = await executeControlCommand('/help', { client: 'cli' });
    console.log(formatCommandText(help));
    process.exit(0);
  }

  const input = args.join(' ');
  const result = await executeControlCommand(input, {
    client: 'cli',
    triggeredBy: 'automation-cli',
    companyId: process.env.AGENT_COMPANY_ID?.trim() || null,
  });

  if (process.env.AUTOMATION_CLI_JSON === '1') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatCommandText(result));
  }
  process.exit(result.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
