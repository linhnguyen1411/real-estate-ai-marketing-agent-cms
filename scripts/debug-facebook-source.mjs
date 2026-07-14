#!/usr/bin/env node
/**
 * Debug Facebook group source scan (requires logged-in profile via npm run agent:login).
 *
 * Usage:
 *   AGENT_SOURCE_ID=<cuid> npm run agent:debug-facebook
 *
 * Does not hardcode URLs — reads AgentSource.url from database.
 */
import 'dotenv/config';
import { checkDatabaseConnection, prisma } from '../server/prisma.ts';
import { loadWorkerConfig } from '../server/agent-worker/config.ts';
import { BrowserManager } from '../server/agent-worker/browserManager.ts';
import { facebookGroupAdapter } from '../server/agent-worker/adapters/facebookGroupAdapter.ts';

const sourceId = process.env.AGENT_SOURCE_ID?.trim();
if (!sourceId) {
  console.error('Set AGENT_SOURCE_ID to an AgentSource id (type facebook_group).');
  process.exit(1);
}

async function main() {
  const db = await checkDatabaseConnection();
  if (!db.ok) {
    console.error('Database unavailable:', db.message);
    process.exit(1);
  }

  const source = await prisma.agentSource.findUnique({ where: { id: sourceId } });
  if (!source) {
    console.error(`Source not found: ${sourceId}`);
    process.exit(1);
  }
  if (source.type !== 'facebook_group') {
    console.error(`Source type is "${source.type}" — expected facebook_group`);
    process.exit(1);
  }

  console.log(`[debug-facebook] Source: ${source.name}`);
  console.log(`[debug-facebook] URL: ${source.url}`);
  console.log('[debug-facebook] Using profile from AGENT_BROWSER_PROFILE_DIR');

  const config = loadWorkerConfig();
  const browser = new BrowserManager(config);

  try {
    await browser.launch();
    const metrics = await facebookGroupAdapter.scan({
      job: {
        id: 'debug-job',
        sourceId: source.id,
        missionId: null,
        type: 'scan_source',
      },
      source,
      mission: null,
      browser,
    });

    console.log('\n[debug-facebook] Metrics:', JSON.stringify(metrics, null, 2));
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error('[debug-facebook] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
