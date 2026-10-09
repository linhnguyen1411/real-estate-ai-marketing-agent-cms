/**
 * SECURITY SCRIPT: RESET OWNER PASSWORD
 *
 * Sets temporary password for owner accounts from environment variable OWNER_RESET_PASSWORD.
 * Enforces must_change_password = true.
 * NEVER prints or leaks the password value.
 *
 * Usage:
 *   OWNER_RESET_PASSWORD="SecureTempPassword123" npx tsx scripts/security/reset-owner-password.ts
 */

import 'dotenv/config';
import { ensureDatabaseReady, readDatabase, upsertUser } from '../../server/dbHelper';
import { hashPassword } from '../../server/modules/auth/password';

async function main() {
  const tempPassword = process.env.OWNER_RESET_PASSWORD?.trim();

  if (!tempPassword) {
    console.error('[ERROR] Missing environment variable: OWNER_RESET_PASSWORD is required.');
    process.exit(1);
  }

  if (tempPassword.length < 10) {
    console.error('[ERROR] OWNER_RESET_PASSWORD must be at least 10 characters long.');
    process.exit(1);
  }

  console.log('==> Connecting to database...');
  await ensureDatabaseReady();

  const db = readDatabase();
  const owners = (db.users || []).filter(u => u.role === 'owner' && u.status === 'active');

  if (owners.length === 0) {
    console.error('[ERROR] No active owner accounts found in database.');
    process.exit(1);
  }

  const newHash = await hashPassword(tempPassword);

  for (const owner of owners) {
    owner.password_hash = newHash;
    delete (owner as any).password;
    owner.must_change_password = true;
    owner.token_version = (owner.token_version ?? 1) + 1;

    await upsertUser(owner, owner.version);
    console.log(`[SUCCESS] Reset temporary password for owner ID "${owner.id}" (${owner.email}). Flag must_change_password=true enforced.`);
  }

  console.log(`[COMPLETED] Successfully updated ${owners.length} owner account(s). Password value was masked and not printed.`);
}

main().catch(err => {
  console.error('[FATAL] Failed to reset owner password:', err?.message || err);
  process.exit(1);
});
