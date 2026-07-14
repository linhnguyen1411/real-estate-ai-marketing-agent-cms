#!/usr/bin/env node
/**
 * test:deploy-safety — static checks that production deploy scripts stay migration-safe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const deploySafe = pkg.scripts['deploy:safe'] || '';
ok('deploy:safe defined', Boolean(deploySafe));
ok('deploy:safe does not call deploy.ps1', !/deploy\.ps1\b/.test(deploySafe));
ok('deploy:safe points to deploy-safe.ps1', /deploy-safe\.ps1/.test(deploySafe));

const safeFiles = [
  'scripts/deploy-safe.ps1',
  'scripts/tmp-vps-safe-deploy.sh',
];
for (const rel of safeFiles) {
  const body = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  ok(`${rel} has no prisma db push`, !/prisma\s+db\s+push/i.test(body));
  ok(`${rel} has no --accept-data-loss`, !/--accept-data-loss/i.test(body));
}

const safeSh = fs.readFileSync(path.join(ROOT, 'scripts/tmp-vps-safe-deploy.sh'), 'utf8');
ok('safe sh uses migrate deploy', /prisma\s+migrate\s+deploy/.test(safeSh));
ok('safe sh does not rm -rf dist before build without backup', !/^rm -rf dist$/m.test(safeSh.split('npm run build')[0]));

const risky = fs.readFileSync(path.join(ROOT, 'scripts/deploy.ps1'), 'utf8');
ok('deploy.ps1 marked DEPRECATED / refuses run', /DEPRECATED|Refusing to run/i.test(risky));

console.log(`\n${passed} deploy-safety checks passed`);
