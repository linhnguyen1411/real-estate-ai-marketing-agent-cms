#!/usr/bin/env node
/**
 * cleanup:agent-runtime — dry-run by default; --apply to delete.
 * Only allowlisted directories. Never follows symlinks. No arbitrary paths.
 *
 * Usage:
 *   npm run cleanup:agent-runtime
 *   npm run cleanup:agent-runtime -- --older-than-days=7
 *   npm run cleanup:agent-runtime -- --apply --older-than-days=14
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWLIST_DIRS = [
  'runtime/screenshots',
  'runtime/debug',
  'runtime/tmp',
  'runtime/outbox-dumps',
  'data/browser-debug',
  'coverage',
  '.cache',
];

const ALLOWLIST_GLOBS = [
  { dir: 'runtime', patterns: [/\.tmp$/i, /\.bak$/i, /\.old$/i, /\.log$/i, /\.swp$/i] },
  { dir: '.', patterns: [/^\.DS_Store$/, /^Thumbs\.db$/, /^desktop\.ini$/i], maxDepth: 4 },
];

/** Never delete these even if matched. */
const PROTECTED_PREFIXES = [
  'data/browser-profiles',
  'runtime/agent-browser-profile',
  'prisma/migrations',
  'node_modules',
  '.git',
  'dist', // leave dist for build; use npm run clean separately
];

function parseArgs(argv) {
  let apply = false;
  let olderThanDays = 0;
  for (const a of argv) {
    if (a === '--apply') apply = true;
    else if (a.startsWith('--older-than-days=')) {
      olderThanDays = Math.max(0, Number(a.split('=')[1]) || 0);
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: cleanup-agent-runtime [--apply] [--older-than-days=N]
Default: dry-run. Only allowlisted runtime/debug artifacts.`);
      process.exit(0);
    }
  }
  return { apply, olderThanDays };
}

function isProtected(relPosix) {
  return PROTECTED_PREFIXES.some(
    (p) => relPosix === p || relPosix.startsWith(p + '/'),
  );
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function isOlderThan(stat, days) {
  if (!days || days <= 0) return true;
  const ageMs = Date.now() - stat.mtimeMs;
  return ageMs >= days * 24 * 60 * 60 * 1000;
}

function safeStat(abs) {
  try {
    return fs.lstatSync(abs);
  } catch {
    return null;
  }
}

function walkFiles(absDir, maxDepth, depth, out) {
  const st = safeStat(absDir);
  if (!st || !st.isDirectory() || st.isSymbolicLink()) return;
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const abs = path.join(absDir, ent.name);
    const rel = toPosix(path.relative(ROOT, abs));
    if (isProtected(rel)) continue;
    let lst;
    try {
      lst = fs.lstatSync(abs);
    } catch {
      continue;
    }
    if (lst.isSymbolicLink()) continue;
    if (lst.isDirectory()) {
      if (depth < maxDepth) walkFiles(abs, maxDepth, depth + 1, out);
    } else if (lst.isFile()) {
      out.push({ abs, rel, size: lst.size, mtimeMs: lst.mtimeMs });
    }
  }
}

function collectCandidates({ olderThanDays }) {
  const found = [];

  for (const relDir of ALLOWLIST_DIRS) {
    const abs = path.join(ROOT, ...relDir.split('/'));
    if (!fs.existsSync(abs)) continue;
    const files = [];
    walkFiles(abs, 12, 0, files);
    for (const f of files) {
      if (!isOlderThan({ mtimeMs: f.mtimeMs }, olderThanDays)) continue;
      found.push(f);
    }
  }

  for (const g of ALLOWLIST_GLOBS) {
    const absBase = path.join(ROOT, ...g.dir.split('/'));
    if (!fs.existsSync(absBase)) continue;
    const files = [];
    walkFiles(absBase, g.maxDepth ?? 8, 0, files);
    for (const f of files) {
      const base = path.basename(f.abs);
      if (!g.patterns.some((re) => re.test(base))) continue;
      if (isProtected(f.rel)) continue;
      if (!isOlderThan({ mtimeMs: f.mtimeMs }, olderThanDays)) continue;
      found.push(f);
    }
  }

  // Dedupe by abs
  const map = new Map();
  for (const f of found) map.set(f.abs, f);
  return [...map.values()].sort((a, b) => a.rel.localeCompare(b.rel));
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const candidates = collectCandidates(opts);
  const totalBytes = candidates.reduce((s, f) => s + f.size, 0);

  console.log('=== cleanup:agent-runtime ===');
  console.log(`mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`older-than-days: ${opts.olderThanDays || 0} (0 = all matching)`);
  console.log(`allowlisted dirs: ${ALLOWLIST_DIRS.join(', ')}`);
  console.log(`candidates: ${candidates.length} files, ${formatBytes(totalBytes)}`);
  console.log('');

  for (const f of candidates) {
    const ageDays = ((Date.now() - f.mtimeMs) / (24 * 60 * 60 * 1000)).toFixed(1);
    console.log(`${opts.apply ? 'DELETE' : 'WOULD DELETE'}  ${formatBytes(f.size).padStart(10)}  ${ageDays}d  ${f.rel}`);
    if (opts.apply) {
      try {
        fs.unlinkSync(f.abs);
      } catch (e) {
        console.error(`  FAIL ${f.rel}: ${e.message}`);
      }
    }
  }

  if (!opts.apply && candidates.length) {
    console.log('\nRe-run with --apply to delete. Review list carefully.');
  }
  if (!candidates.length) {
    console.log('Nothing to clean in allowlisted paths.');
  }
}

main();
