/**
 * SECURITY SCRIPT: FORCE PASSWORD RESET
 *
 * This script sets `must_change_password = true` for all active user records in the local database.
 *
 * CAUTION: FOR LOCAL TESTING / STAGING USE ONLY.
 * DO NOT RUN DIRECTLY ON PRODUCTION ENVIRONMENT.
 *
 * Usage:
 *   npx tsx scripts/security/force-password-reset.ts
 */

import { ensureDatabaseReady, readDatabase, writeDatabase } from '../../server/dbHelper';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[SECURITY BLOCK] Refusing to run force-password-reset directly on production without explicit migration.');
    process.exit(1);
  }

  console.log('==> Initializing database connection...');
  await ensureDatabaseReady();

  const db = readDatabase();
  const users = db.users || [];
  let updatedCount = 0;

  for (const user of users) {
    user.must_change_password = true;
    updatedCount++;
  }

  await writeDatabase(db);
  console.log(`[SUCCESS] Set must_change_password=true for ${updatedCount} users.`);
}

main().catch((err) => {
  console.error('[ERROR] Failed to force password reset:', err);
  process.exit(1);
});
