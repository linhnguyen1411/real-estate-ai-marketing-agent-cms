/**
 * Frontend architecture smoke / contract checks.
 * Pure Node — no DB / no TS loader required.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function mustExist(rel) {
  assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
}

function extractStringLiterals(src, pattern) {
  const out = [];
  let m;
  const re = new RegExp(pattern, 'g');
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

function main() {
  const checks = [];

  for (const rel of [
    'src/app/AppProviders.tsx',
    'src/app/routeConfig.ts',
    'src/app/layouts/AdminLayout.tsx',
    'src/app/layouts/AdminHeader.tsx',
    'src/app/layouts/AdminSidebar.tsx',
    'src/app/layouts/AdminToast.tsx',
    'src/app/navigation/tabPaths.ts',
    'src/app/navigation/sidebarConfig.ts',
    'src/app/navigation/navigationTypes.ts',
    'src/features/auth/LoginPage.tsx',
  ]) {
    mustExist(rel);
    checks.push(`exists ${rel}`);
  }

  const app = read('src/App.tsx');
  assert.match(app, /AdminLayout/, 'App.tsx must mount AdminLayout');
  assert.match(app, /LoginPage/, 'App.tsx must use LoginPage');
  assert.match(app, /AppProviders/, 'App.tsx must wrap AppProviders');
  assert.doesNotMatch(app, /const SEO_SUBMENU/, 'SEO_SUBMENU must not be redefined in App');
  assert.doesNotMatch(app, /const AGENT_SUBMENU/, 'AGENT_SUBMENU must not be redefined in App');
  assert.match(app, /getBootstrapData/, 'performance bootstrap preserved');
  assert.match(app, /navigationCounts/, 'navigation counts preserved');
  checks.push('App.tsx wires new shell + keeps bootstrap');

  const routeConfig = read('src/app/routeConfig.ts');
  const paths = extractStringLiterals(routeConfig, String.raw`path:\s*['"]([^'"]+)['"]`);
  assert.ok(paths.length >= 17, `expected >=17 admin routes, got ${paths.length}`);
  assert.equal(new Set(paths).size, paths.length, 'duplicate admin paths');
  assert.ok(paths.includes('/admin/agents/findings'));
  assert.ok(paths.includes('/admin/seo/posts'));
  assert.ok(paths.includes('/admin/dashboard'));
  checks.push('routeConfig unique + critical paths');

  const tabPaths = read('src/app/navigation/tabPaths.ts');
  assert.match(tabPaths, /real_estate_ai_active_tab/);
  assert.match(tabPaths, /'agent-findings': '\/admin\/agents\/findings'/);
  assert.match(tabPaths, /'seo-posts': '\/admin\/seo\/posts'/);
  checks.push('tab path compatibility');

  const mainTsx = read('src/main.tsx');
  for (const p of [
    '/admin/login',
    '/admin/dashboard',
    '/admin/seo/posts',
    '/admin/agents',
    '/admin/agents/findings',
  ]) {
    assert.ok(mainTsx.includes(`path="${p}"`), `main.tsx missing route ${p}`);
  }
  checks.push('main.tsx keeps admin route URLs');

  const sidebar = read('src/app/layouts/AdminSidebar.tsx');
  assert.match(sidebar, /buildPrimaryNavItems/);
  assert.match(sidebar, /AGENT_SUBMENU/);
  checks.push('sidebar uses config data');

  console.log('frontend-architecture checks passed:');
  for (const c of checks) console.log('  ✓', c);
}

main();
