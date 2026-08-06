/**
 * Lightweight UI structure tests for Operations Center redesign.
 * Run: node scripts/test-operations-center-ui.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const checks = [];

function ok(label) {
  checks.push(label);
  console.log(`PASS ${label}`);
}

const page = read('src/features/agent/runtime-monitor/pages/RuntimeMonitorPage.tsx');
assert.match(page, /Automation Operations Center|OpsCenterHeader/);
assert.match(page, /lg:grid-cols-12/);
assert.match(page, /lg:hidden/);
assert.match(page, /REFRESH_MS\s*=\s*5\s*\*\s*60/);
assert.doesNotMatch(page, /POLL_MS\s*=\s*8/);
ok('Desktop/Mobile layout + snapshot refresh policy');

const fleet = read('src/features/agent/runtime-monitor/components/FleetPanel.tsx');
assert.match(fleet, /FleetAgentCard/);
assert.match(fleet, /CPU/);
assert.match(fleet, /Heartbeat/);
assert.match(fleet, /ProgressBar/);
ok('Fleet cards');

const ops = read('src/features/agent/runtime-monitor/components/OperationsPanels.tsx');
assert.match(ops, /ScannerPanel/);
assert.match(ops, /PublisherPanel/);
assert.match(ops, /MissionPanel/);
assert.match(ops, /BrowserPanel/);
ok('Operations panels');

const side = read('src/features/agent/runtime-monitor/components/ActivityAlerts.tsx');
assert.match(side, /ActivityTimeline/);
assert.match(side, /AlertsPanel/);
assert.match(side, /QuickActions/);
ok('Timeline + Alerts + Quick Actions');

const prim = read('src/features/agent/runtime-monitor/components/OpsPrimitives.tsx');
assert.match(prim, /SkeletonBlock/);
assert.match(prim, /EmptyHint/);
assert.match(prim, /Accordion/);
assert.match(prim, /ProgressBar/);
assert.match(prim, /StatusBadge/);
ok('A11y primitives (skeleton/empty/badge)');

assert.match(page, /memo|useMemo/);
assert.match(fleet, /memo/);
ok('Performance memoization');

// Ensure presentation-only — no new API paths invented in the page
assert.doesNotMatch(page, /fetch\(['`]\/api\/(?!agent\/runtime)/);
assert.match(page, /fetchAutomationRuntime/);
ok('No API surface change from page');

console.log(`\n${checks.length} operations-center UI checks PASS`);
