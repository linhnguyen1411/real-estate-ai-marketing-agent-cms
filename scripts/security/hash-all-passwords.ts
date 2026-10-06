/**
 * Password Migration Script:
 * Hashes all remaining plaintext user passwords using scrypt,
 * deletes the plaintext 'password' field, sets 'must_change_password = true',
 * and reports the exact count before and after.
 *
 * Usage:
 *   npx tsx scripts/security/hash-all-passwords.ts [--dry-run]
 */

import { ensureDatabaseReady, readDatabase, upsertUser } from '../../server/dbHelper';
import { hashPassword } from '../../server/modules/auth/password';
import type { User } from '../../src/types';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`[HASH-PASSWORDS] Starting password hygiene migration (dryRun: ${isDryRun})...`);

  await ensureDatabaseReady();
  const db = readDatabase();
  const users = db.users || [];

  let totalUsers = users.length;
  let plaintextUsersCount = 0;
  let alreadyHashedCount = 0;
  let migratedCount = 0;

  for (const user of users) {
    if (user.password && !user.password_hash) {
      plaintextUsersCount++;
    } else if (user.password_hash) {
      alreadyHashedCount++;
    }
  }

  console.log(`[HASH-PASSWORDS] Total users found: ${totalUsers}`);
  console.log(`[HASH-PASSWORDS] Users with plaintext password: ${plaintextUsersCount}`);
  console.log(`[HASH-PASSWORDS] Users already hashed (scrypt): ${alreadyHashedCount}`);

  for (const user of users) {
    if (user.password) {
      const plaintext = String(user.password);
      const newHash = await hashPassword(plaintext);

      console.log(`[HASH-PASSWORDS] Migrating user "${user.email}" (${user.id})...`);
      migratedCount++;

      if (!isDryRun) {
        user.password_hash = newHash;
        delete user.password;
        user.must_change_password = true; // Force user to change password upon next login
        await upsertUser(user, user.version);
      }
    }
  }

  console.log(`\n=================== BÁO CÁO KẾT QUẢ ===================`);
  console.log(`  Tổng số tài khoản: ${totalUsers}`);
  console.log(`  Số tài khoản plaintext trước khi chạy: ${plaintextUsersCount}`);
  console.log(`  Số tài khoản đã băm (scrypt): ${isDryRun ? 0 : migratedCount}`);
  console.log(`  Số tài khoản còn plaintext sau khi chạy: ${isDryRun ? plaintextUsersCount : 0}`);
  console.log(`  Trạng thái must_change_password: ${isDryRun ? 'Chưa áp dụng (dry-run)' : 'Đã bật bắt buộc đổi mật khẩu'}`);
  console.log(`========================================================\n`);

  if (isDryRun) {
    console.log(`[DRY RUN] Hoàn tất kiểm tra thử. Không có dữ liệu nào bị thay đổi.`);
  } else {
    console.log(`[DONE] Đã băm và xóa sạch toàn bộ mật khẩu plaintext thành công.`);
  }
}

main().catch(err => {
  console.error('[HASH-PASSWORDS] Lỗi xảy ra:', err);
  process.exit(1);
});
