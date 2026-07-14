#!/usr/bin/env node
/**
 * test:agent-regression — ordered agent suite; non-zero on first failure.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SUITE = [
  'test:lead-extractors',
  'test:real-estate-domain-gate',
  'test:finding-classification',
  'test:lead-intelligence-resolver',
  'test:lead-intelligence-domain',
  'test:finding-structured-data',
  'test:facebook-dom-parser',
  'test:facebook-checkpoint',
  'test:website-reader',
  'test:lead-analyzer',
  'test:lead-pipeline',
  'test:finding-promotion',
  'test:external-inventory',
  'test:finding-matching',
  'test:investor-lead-conversion',
  'test:official-inventory-conversion',
  'test:agent-sync-outbox',
  'test:telegram-notifications',
  'test:agent-ingestion-api',
  'test:agent-scheduler',
  'test:agent-api',
  'test:agent-tenant-isolation',
  'test:deploy-safety',
];

const results = [];
let failed = false;

console.log('=== test:agent-regression ===');
console.log(`cases: ${SUITE.length}\n`);

for (const script of SUITE) {
  const started = Date.now();
  process.stdout.write(`→ ${script} ... `);
  const r = spawnSync('npm', ['run', script], {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const ms = Date.now() - started;
  const ok = r.status === 0;
  if (!ok) failed = true;
  results.push({ script, ok, ms, status: r.status });
  console.log(`${ok ? 'PASS' : 'FAIL'} (${ms}ms)`);
  if (!ok) {
    console.error((r.stderr || r.stdout || '').split('\n').slice(-40).join('\n'));
    console.error(`\nStopped at ${script} (exit ${r.status}).`);
    break;
  }
}

console.log('\n--- summary ---');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(r.ms).padStart(6)}ms  ${r.script}`);
}
console.log(`ran: ${results.length}/${SUITE.length}`);
process.exit(failed ? 1 : 0);
