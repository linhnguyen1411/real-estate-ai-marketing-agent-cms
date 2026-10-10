/**
 * SECURITY SCRIPT: CREATE AGENT INGEST API KEY
 *
 * Generates an HMAC API Key pair (Key ID + Secret) for Desktop Agent.
 * Stores hash and encrypted secret in database.
 * Prints Key ID and Secret once for configuration in Desktop App.
 *
 * Usage:
 *   npx tsx scripts/security/create-agent-api-key.ts
 *   npx tsx scripts/security/create-agent-api-key.ts --name "Windows Agent"
 */

import 'dotenv/config';
import { prisma } from '../../server/prisma';
import {
  generateApiKeyPair,
  hashApiSecret,
  encryptApiSecret,
} from '../../server/agentIngest/hmacAuth';

async function main() {
  const args = process.argv.slice(2);
  let name = 'House & Life Desktop Agent';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) {
      name = args[i + 1];
    }
  }

  console.log('==> Connecting to database...');
  
  // Find first active company if any
  const company = await prisma.company.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const { keyId, secret } = generateApiKeyPair();
  const secretHash = hashApiSecret(secret);
  const encryptedSecret = encryptApiSecret(secret);

  const credential = await prisma.agentApiCredential.create({
    data: {
      companyId: company?.id ?? null,
      name,
      keyId,
      secretHash,
      encryptedSecret,
      scopes: ['findings:ingest', 'health:write'],
      status: 'active',
    },
  });

  console.log('\n======================================================');
  console.log('🎉 AGENT INGEST API KEY CREATED SUCCESSFULLY');
  console.log('======================================================');
  console.log(`ID:           ${credential.id}`);
  console.log(`Name:         ${credential.name}`);
  console.log(`Company ID:   ${credential.companyId || '(None - Global)'}`);
  console.log(`Scopes:       ${JSON.stringify(credential.scopes)}`);
  console.log('------------------------------------------------------');
  console.log(`🔑 VPS API Key ID:   ${keyId}`);
  console.log(`🔐 VPS API Secret:   ${secret}`);
  console.log('======================================================');
  console.log('⚠️  LƯU Ý: Secret chỉ hiển thị một lần duy nhất này.');
  console.log('Hãy copy Key ID và Secret này dán vào màn hình Cài đặt của Desktop Agent App.\n');
}

main()
  .catch(err => {
    console.error('[FATAL] Failed to create Agent API key:', err?.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
