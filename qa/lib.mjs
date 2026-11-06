import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
export const BASE = process.env.QA_BASE || 'http://localhost:3000';
export const INGEST_BASE = process.env.QA_INGEST_BASE || 'http://localhost:3010';
export const QA_PASSWORD = 'QaPass!2026x';
export const QA_NEW_PASSWORD = 'QaPass!2026y';

export const TEST_EMAILS = {
  adminA: 'admin@danang.example.com',
  adminB: 'admin@hoian.example.com',
  memberA: 'member-a@danang.example.com',
  memberB: 'member-b@danang.example.com',
};

// Seeded demo accounts store legacy plaintext passwords; the first login
// transparently upgrades them to Argon2. QA never mutates these accounts.
export const TEST_PASSWORDS = {
  adminA: 'admin123',
  adminB: 'admin123',
  memberA: 'member123',
  memberB: 'member123',
};

export function passwordFor(userKey) {
  return TEST_PASSWORDS[userKey];
}

export const SUPER_ADMIN = { email: 'admin@example.com', password: 'admin123' };

const STATE_DIR = path.join(process.cwd(), 'runtime', 'qa');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

export function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function newState() {
  return {
    startedAt: new Date().toISOString(),
    backups: [],
    entitlements: [],
    disposableUserEmails: [],
    created: {},
  };
}

export async function http(pathname, options = {}) {
  const {
    method = 'GET',
    token,
    body,
    headers = {},
    base = BASE,
    redirect = 'follow',
  } = options;
  const finalHeaders = { Accept: 'application/json', ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    redirect,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json };
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: mong đợi ${JSON.stringify(expected)}, nhận ${JSON.stringify(actual)}`);
  }
}

export function assertStatus(res, expected, label = 'status') {
  if (res.status !== expected) {
    const snippet = (res.text || '').slice(0, 300);
    throw new Error(`${label}: mong đợi HTTP ${expected}, nhận HTTP ${res.status} — ${snippet}`);
  }
}

export async function login(email, password) {
  const res = await http('/api/auth/login', { method: 'POST', body: { email, password } });
  assertStatus(res, 200, `login ${email}`);
  assert(res.json?.data?.token, `login ${email}: thiếu token`);
  return { token: res.json.data.token, user: res.json.data.user, res };
}

export async function setupTestEnv(state, superToken) {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // Disposable users are created through the real user-management API so the
  // server cache and database stay in sync. Seeded demo accounts are not
  // touched (they still store legacy plaintext passwords).
  const runId = Date.now().toString(36);
  const emails = {
    adminA: `qa.admin-a.${runId}@example.com`,
    adminB: `qa.admin-b.${runId}@example.com`,
    memberA: `qa.member-a.${runId}@example.com`,
    memberB: `qa.member-b.${runId}@example.com`,
  };
  const definitions = {
    adminA: { name: 'QA Admin A', role: 'company', company_id: 'comp-da-nang' },
    adminB: { name: 'QA Admin B', role: 'company', company_id: 'comp-hoi-an' },
    memberA: { name: 'QA Member A', role: 'member', company_id: 'comp-da-nang' },
    memberB: { name: 'QA Member B', role: 'member', company_id: 'comp-da-nang' },
  };

  const createdUsers = {};
  for (const key of Object.keys(definitions)) {
    const created = await http('/api/users', {
      method: 'POST',
      token: superToken,
      body: { ...definitions[key], email: emails[key], password: QA_PASSWORD },
    });
    assertStatus(created, 200, `tạo QA user ${key}`);
    createdUsers[key] = created.json.data;
    state.disposableUserEmails.push(emails[key]);
    saveState(state);
  }
  Object.assign(TEST_EMAILS, emails);
  Object.assign(TEST_PASSWORDS, {
    adminA: QA_PASSWORD,
    adminB: QA_PASSWORD,
    memberA: QA_PASSWORD,
    memberB: QA_PASSWORD,
  });

  // License tests need a user without any prior key or entitlement. Creating it
  // through the API avoids the public register rate limit on repeated runs.
  const trialEmail = `qa.trial.${runId}@example.com`;
  const trialCreated = await http('/api/users', {
    method: 'POST',
    token: superToken,
    body: {
      name: 'QA Trial User',
      email: trialEmail,
      password: QA_PASSWORD,
      role: 'member',
      company_id: 'comp-da-nang',
    },
  });
  assertStatus(trialCreated, 200, 'tạo QA trial user');
  state.disposableUserEmails.push(trialEmail);
  saveState(state);

  const features = [
    'tool.exe',
    'agent.*',
    'crm',
    'investor_leads',
    'fb_inbox',
    'automation.*',
    'team.manage',
    'lead.intel',
  ];
  const startsAt = new Date(Date.now() - 60_000);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  for (const key of ['adminA', 'adminB', 'memberA', 'memberB']) {
    const email = TEST_EMAILS[key];
    const user = await prisma.user.findUnique({ where: { email } });
    const ent = await prisma.entitlement.create({
      data: {
        id: `qa-ent-${crypto.randomUUID()}`,
        subjectType: 'user',
        subjectId: user.id,
        plan: 'custom',
        features,
        startsAt,
        expiresAt,
        source: 'super_admin',
        grantedBy: 'qa-runner',
      },
    });
    state.entitlements.push(ent.id);
  }
  saveState(state);

  return {
    users: Object.fromEntries(
      await Promise.all(
        Object.entries(TEST_EMAILS).map(async ([key, email]) => [key, await prisma.user.findUnique({ where: { email } })]),
      ),
    ),
    trial: { email: trialEmail, id: trialCreated.json.data.id },
  };
}

export async function restoreState(state) {
  if (!state) return;
  // Restore original password hashes / token versions.
  for (const backup of state.backups || []) {
    await prisma.user.update({
      where: { email: backup.email },
      data: { passwordHash: backup.passwordHash, tokenVersion: backup.tokenVersion },
    }).catch(() => {});
  }
  // Remove QA entitlements we created.
  if ((state.entitlements || []).length) {
    await prisma.entitlement.deleteMany({ where: { id: { in: state.entitlements } } }).catch(() => {});
  }
  // Remove disposable users and their dependent rows.
  const disposableEmails = state.disposableUserEmails || [];
  if (disposableEmails.length) {
    const users = await prisma.user.findMany({ where: { email: { in: disposableEmails } } });
    for (const user of users) {
      await prisma.licenseDevice.deleteMany({ where: { licenseKey: { userId: user.id } } }).catch(() => {});
      await prisma.licenseKey.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.walletTransaction.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.userWallet.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.entitlement.deleteMany({ where: { subjectType: 'user', subjectId: user.id } }).catch(() => {});
      await prisma.teamMember.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  }
}

export function resultsToMarkdown(results) {
  const lines = [];
  lines.push('| ID | Module | Ưu tiên | Tiêu đề | Kết quả | Bằng chứng |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of results) {
    const evidence = String(r.status === 'PASS' ? r.evidence ?? '' : r.evidence ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, ' ')
      .slice(0, 220);
    const badge = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? '**FAIL**' : r.status;
    lines.push(`| ${r.id} | ${r.module} | ${r.priority} | ${r.title} | ${badge} | ${evidence} |`);
  }
  return lines.join('\n');
}
