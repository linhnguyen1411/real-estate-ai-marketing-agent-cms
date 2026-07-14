/**
 * Smoke test AI Agent admin API (Sprint 1.2).
 *
 * Usage:
 *   npm run dev   # terminal 1
 *   TEST_EMAIL=owner@example.com TEST_PASSWORD=secret npm run test:agent-api
 *
 * Loads .env automatically. Env:
 *   API_BASE (default http://localhost:3000)
 *   TEST_EMAIL, TEST_PASSWORD — required for live HTTP smoke
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.env.API_BASE || 'http://localhost:3000').replace(/\/+$/, '');
const email = process.env.TEST_EMAIL || '';
const password = process.env.TEST_PASSWORD || '';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assertOk(label, status, expected = [200]) {
  if (!expected.includes(status)) {
    throw new Error(`${label} failed: HTTP ${status}`);
  }
}

async function request(pathName, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(`${base}${pathName}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function contractChecks() {
  const routes = fs.readFileSync(path.join(ROOT, 'server/agent/agentRoutes.ts'), 'utf8');
  if (!/export function registerAgentAdminRoutes/.test(routes)) {
    throw new Error('registerAgentAdminRoutes missing');
  }
  for (const needle of ['/dashboard', '/sources', '/findings', '/jobs']) {
    if (!routes.includes(needle)) throw new Error(`agentRoutes missing path marker ${needle}`);
  }
  console.log('✓ offline contract: agentRoutes surface');
}

async function main() {
  contractChecks();

  if (!email || !password) {
    console.log(
      'NOTE: TEST_EMAIL/TEST_PASSWORD unset — offline contract only (live HTTP smoke skipped).',
    );
    return;
  }

  console.log('==> Login');
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assertOk('login', login.res.status);
  const token = login.json?.data?.token;
  if (!token) throw new Error('Missing auth token');
  const auth = { Authorization: `Bearer ${token}` };

  console.log('==> Dashboard');
  const dash = await request('/api/agent/dashboard', { headers: auth });
  assertOk('dashboard', dash.res.status);
  console.log('counts', dash.json.data);

  const suffix = Date.now();
  console.log('==> Create source');
  const sourceRes = await request('/api/agent/sources', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      name: `Test FB Group ${suffix}`,
      type: 'facebook_group',
      url: `https://facebook.com/groups/test-${suffix}`,
      priority: 3,
    }),
  });
  assertOk('create source', sourceRes.res.status, [200]);
  const sourceId = sourceRes.json.data.id;
  console.log('sourceId', sourceId);

  console.log('==> List sources');
  const sources = await request('/api/agent/sources?page=1&limit=5', { headers: auth });
  assertOk('list sources', sources.res.status);

  console.log('==> Patch source');
  const patchSource = await request(`/api/agent/sources/${sourceId}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ priority: 2 }),
  });
  assertOk('patch source', patchSource.res.status);

  console.log('==> Create mission');
  const missionRes = await request('/api/agent/missions', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      name: `Scan mission ${suffix}`,
      objective: 'Thu thập bài đăng mới từ nguồn test',
      rules: { sourceIds: [sourceId] },
    }),
  });
  assertOk('create mission', missionRes.res.status);
  const missionId = missionRes.json.data.id;
  console.log('missionId', missionId);

  console.log('==> Run mission (enqueue only)');
  const runRes = await request(`/api/agent/missions/${missionId}/run`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({}),
  });
  assertOk('run mission', runRes.res.status);
  console.log('enqueue', runRes.json.data);

  console.log('==> List jobs');
  const jobs = await request(`/api/agent/jobs?missionId=${missionId}&status=queued`, { headers: auth });
  assertOk('list jobs', jobs.res.status);
  console.log('jobs', jobs.json.meta, jobs.json.data?.length);

  console.log('==> List findings');
  const findings = await request('/api/agent/findings?page=1&limit=5', { headers: auth });
  assertOk('list findings', findings.res.status);

  console.log('==> List notifications');
  const notifications = await request('/api/agent/notifications?page=1&limit=5', { headers: auth });
  assertOk('list notifications', notifications.res.status);

  console.log('==> Delete source (expect soft pause if jobs exist)');
  const delSource = await request(`/api/agent/sources/${sourceId}`, {
    method: 'DELETE',
    headers: auth,
  });
  assertOk('delete source', delSource.res.status);
  console.log('delete meta', delSource.json.meta);

  console.log('==> Cleanup mission');
  await request(`/api/agent/missions/${missionId}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ status: 'completed' }),
  });

  console.log('\nAll agent API smoke checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
