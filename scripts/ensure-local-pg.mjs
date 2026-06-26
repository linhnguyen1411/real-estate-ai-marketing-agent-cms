/**
 * Dev helper: tự bật Postgres cluster local (Windows) nếu DATABASE_URL trỏ localhost.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadDatabaseUrl() {
  const root = process.cwd();
  for (const file of ['.env', '.env.local']) {
    const envPath = join(root, file);
    if (!existsSync(envPath)) continue;
    const match = readFileSync(envPath, 'utf8').match(/^DATABASE_URL\s*=\s*(.+)\s*$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return process.env.DATABASE_URL || '';
}

const dbUrl = loadDatabaseUrl();
if (!dbUrl || !/localhost|127\.0\.0\.1/i.test(dbUrl)) {
  process.exit(0);
}

if (process.platform !== 'win32') {
  process.exit(0);
}

const clusterData = join(process.env.LOCALAPPDATA || '', 'real-estate-cms-pg', 'data');
if (!existsSync(clusterData)) {
  console.log('[dev] Chưa có Postgres local. Chạy: npm run db:setup-local');
  process.exit(0);
}

function pgStatus() {
  try {
    execSync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pg-cluster.ps1 -Action status',
      { stdio: 'pipe', cwd: process.cwd() },
    );
    return true;
  } catch {
    return false;
  }
}

if (pgStatus()) {
  process.exit(0);
}

console.log('[dev] Postgres local chưa chạy — đang bật...');
try {
  execSync(
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pg-cluster.ps1 -Action start',
    { stdio: 'inherit', cwd: process.cwd() },
  );
  console.log('[dev] Postgres local đã bật.');
} catch {
  console.warn('[dev] Không bật được Postgres. Thử: npm run db:pg-start');
}
