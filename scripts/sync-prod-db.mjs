#!/usr/bin/env node
/**
 * Restore data/prod-dump.sql into local PostgreSQL (DATABASE_URL).
 *
 * Usage:
 *   npm run db:sync-prod
 *   node scripts/sync-prod-db.mjs --file data/prod-dump.sql
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import pg from 'pg';

const args = process.argv.slice(2);
const fileArgIndex = args.indexOf('--file');
const dumpPath = path.resolve(
  fileArgIndex >= 0 ? args[fileArgIndex + 1] : path.join(process.cwd(), 'data', 'prod-dump.sql')
);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required in .env');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL.replace(/\?.*$/, '');

if (!fs.existsSync(dumpPath)) {
  console.error(`Dump file not found: ${dumpPath}`);
  console.error('Run first: npm run db:pull-prod');
  process.exit(1);
}

function findPsqlExecutable() {
  const fromPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['psql'], {
    encoding: 'utf8',
    shell: true,
  });
  if (fromPath.status === 0) {
    const candidate = fromPath.stdout.split(/\r?\n/).find((line) => line.trim().endsWith('psql.exe') || line.trim() === 'psql');
    if (candidate) return candidate.trim();
  }

  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (fs.existsSync(base)) {
      for (const version of fs.readdirSync(base)) {
        const psql = path.join(base, version, 'bin', 'psql.exe');
        if (fs.existsSync(psql)) return psql;
      }
    }
  }
  return null;
}

function tryPsqlRestore() {
  const psqlExe = findPsqlExecutable();
  if (!psqlExe) return false;

  console.log(`Restoring via psql -> ${connectionString.replace(/:[^:@/]+@/, ':***@')}`);
  const result = spawnSync(psqlExe, [connectionString, '-v', 'ON_ERROR_STOP=1', '-f', dumpPath], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  return result.status === 0;
}

async function restoreViaPg() {
  console.log(`Restoring via node pg -> ${connectionString.replace(/:[^:@/]+@/, ':***@')}`);
  const sql = fs.readFileSync(dumpPath, 'utf8');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function verify() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const tables = ['companies', 'users', 'cms_records', 'settings', 'leads'];
    console.log('');
    console.log('Row counts:');
    for (const table of tables) {
      try {
        const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
        console.log(`  ${table}: ${rows[0].count}`);
      } catch {
        console.log(`  ${table}: (n/a)`);
      }
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const sizeMb = (fs.statSync(dumpPath).size / (1024 * 1024)).toFixed(2);
  console.log(`Reading dump: ${dumpPath} (${sizeMb} MB)`);

  const ok = tryPsqlRestore();
  if (!ok) {
    console.log('psql not available, falling back to node pg...');
    await restoreViaPg();
  }

  await verify();
  console.log('');
  console.log('Sync complete. Start app: npm run dev');
}

main().catch((error) => {
  console.error('Sync failed:', error.message || error);
  process.exit(1);
});
