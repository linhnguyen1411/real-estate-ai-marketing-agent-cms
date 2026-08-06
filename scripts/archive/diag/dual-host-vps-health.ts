/**
 * Test VPS HMAC health without printing secrets.
 */
import { ensureDatabaseReady, getSettings } from '../server/dbHelper';
import { testVpsConnection } from '../server/agentSync/vpsClient';
import type { AppSettings } from '../src/types';
import { prisma } from '../server/prisma';

async function main() {
  await ensureDatabaseReady();
  const settings = getSettings() as AppSettings;
  const result = await testVpsConnection(settings);
  console.log(JSON.stringify({
    ok: result.ok,
    message: result.message,
    error: result.error,
    data: result.data
      ? {
          service: result.data.service,
          healthy: result.data.healthy,
          dbReady: result.data.dbReady,
          apiVersion: result.data.apiVersion,
          tenant: result.data.tenant,
          ingestEnabled: result.data.ingestEnabled,
          telegramEnabled: result.data.telegramEnabled,
          serverTime: result.data.serverTime,
          maxBatchSize: result.data.maxBatchSize,
          // Mission 2.0 capability fields (may be absent on older VPS)
          missionProvenance: result.data.missionProvenance ?? result.data.missionWorkflow ?? null,
          acceptedPipelineVersions: result.data.acceptedPipelineVersions ?? null,
          capabilities: result.data.capabilities ?? null,
          keys: Object.keys(result.data),
        }
      : null,
  }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
