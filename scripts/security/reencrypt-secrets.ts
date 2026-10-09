/**
 * Re-encryption migration script:
 * Re-encrypts Facebook page tokens (from v1/plaintext to v2:) and settings secrets with CURRENT_KID (k1).
 * Supports --dry-run flag. Idempotent.
 *
 * Usage:
 *   npx tsx scripts/security/reencrypt-secrets.ts [--dry-run]
 */

import 'dotenv/config';
import { prisma } from '../../server/prisma';
import { decryptAccessToken, encryptAccessToken } from '../../server/facebook/tokenCrypto';
import { decryptSecret, encryptSecret, isEncryptedSecret, CURRENT_KID } from '../../server/security/settingsCrypto';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`[REENCRYPT] Starting re-encryption of secrets (dryRun: ${isDryRun})...`);

  let fbTokenCount = 0;
  let fbReencrypted = 0;
  let settingsReencrypted = 0;

  // 1. Facebook Page Connections
  try {
    const connections = await prisma.facebookPageConnection.findMany();
    fbTokenCount = connections.length;
    console.log(`[REENCRYPT] Found ${fbTokenCount} Facebook Page Connection(s).`);

    for (const conn of connections) {
      if (!conn.accessTokenEncrypted) continue;

      const currentPayload = conn.accessTokenEncrypted;
      // If already v2:k1, skip
      if (currentPayload.startsWith(`v2:${CURRENT_KID}:`)) {
        continue;
      }

      try {
        let decrypted: string;
        if (currentPayload.startsWith('v2:') || currentPayload.startsWith('v1:')) {
          decrypted = decryptAccessToken(currentPayload);
        } else {
          // Plaintext token without prefix (legacy unencrypted)
          decrypted = currentPayload;
        }
        const newEncrypted = encryptAccessToken(decrypted);

        console.log(`[REENCRYPT] Page "${conn.pageName || conn.pageId}": re-encrypting token (${currentPayload.slice(0, 8)}... -> ${newEncrypted.slice(0, 8)}...)`);
        fbReencrypted++;

        if (!isDryRun) {
          await prisma.facebookPageConnection.update({
            where: { id: conn.id },
            data: {
              accessTokenEncrypted: newEncrypted,
              updatedAt: new Date(),
            },
          });
        }
      } catch (err: any) {
        console.error(`[REENCRYPT] Failed to re-encrypt token for page ${conn.pageId}:`, err.message || err);
      }
    }
  } catch (err: any) {
    console.warn(`[REENCRYPT] Facebook connections check notice:`, err.message || err);
  }

  // 2. AppSettings Secrets (Gemini, OpenAI, Telegram, Agent Sync)
  try {
    const appSettingRow = await prisma.appSetting.findUnique({ where: { key: 'app' } });
    if (appSettingRow && appSettingRow.data && typeof appSettingRow.data === 'object') {
      const settings = { ...(appSettingRow.data as Record<string, any>) };
      const secretFields: Array<{ key: string; context: string }> = [
        { key: 'gemini_api_key', context: 'gemini' },
        { key: 'openai_api_key', context: 'openai' },
        { key: 'telegram_bot_token', context: 'telegram' },
        { key: 'agent_sync_secret', context: 'agent_sync' },
      ];

      let modifiedSettings = false;

      for (const { key, context } of secretFields) {
        const val = settings[key];
        if (typeof val === 'string' && val.trim().length > 0) {
          // If already enc:k1, skip
          if (val.startsWith(`enc:${CURRENT_KID}:`)) {
            continue;
          }

          try {
            const plaintext = decryptSecret(val, context);
            if (plaintext) {
              const newEnc = encryptSecret(plaintext, context);
              console.log(`[REENCRYPT] Setting "${key}": re-encrypting secret with kid=${CURRENT_KID}`);
              settings[key] = newEnc;
              modifiedSettings = true;
              settingsReencrypted++;
            }
          } catch (decErr: any) {
            console.error(`[REENCRYPT] Failed to decrypt setting "${key}":`, decErr.message || decErr);
          }
        }
      }

      if (modifiedSettings && !isDryRun) {
        await prisma.appSetting.update({
          where: { key: 'app' },
          data: {
            data: settings,
            updatedAt: new Date(),
          },
        });
        console.log(`[REENCRYPT] AppSettings updated in database successfully.`);
      }
    }
  } catch (err: any) {
    console.warn(`[REENCRYPT] Settings re-encryption notice:`, err.message || err);
  }

  console.log(`[REENCRYPT] Summary:`);
  console.log(`  Facebook tokens re-encrypted: ${fbReencrypted} / ${fbTokenCount}`);
  console.log(`  Settings secrets re-encrypted: ${settingsReencrypted}`);
  if (isDryRun) {
    console.log(`  [DRY RUN] No database records were modified.`);
  } else {
    console.log(`  Database update completed.`);
  }
}

main().catch(err => {
  console.error('[REENCRYPT] Fatal error:', err);
  process.exit(1);
});
