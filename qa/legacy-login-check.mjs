// Verifies BUG-AUTH-01: seeded demo users store a legacy plaintext password in
// `users.data.password` with a NULL password_hash. After the cache loader fix
// those users must be able to log in, get upgraded to Argon2, and use /me.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { prisma } from './lib.mjs';

const PORT = Number(process.env.QA_LEGACY_PORT || 3101);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'QaLegacy!2026';
const runId = Date.now().toString(36);
const email = `qa.legacy.${runId}@example.com`;
const userId = `qa-legacy-${runId}`;

let child = null;

async function waitForHealth(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new Error(`Server thoát sớm với mã ${child.exitCode}`);
    }
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Hết thời gian chờ server khởi động');
}

async function api(pathname, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await fetch(`${BASE}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup() {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const stopped = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 8000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (!(await stopped)) child.kill('SIGKILL');
}

async function startServer() {
  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  child = spawn(process.execPath, [tsxCli, 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      SKIP_FREE_DEV_PORTS: '1',
      RUN_WORKERS: 'false',
      AGENT_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  await waitForHealth();
  console.log(`[setup] server ready on ${BASE}`);
}

async function loginAndCheck(label) {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  assert(login.status === 200, `${label} login: mong đợi 200, nhận ${login.status} — ${login.text.slice(0, 300)}`);
  const token = login.json?.data?.token;
  assert(token, `${label} login: thiếu token`);
  const me = await api('/api/auth/me', { token });
  assert(me.status === 200, `${label} /me: mong đợi 200, nhận ${me.status}`);
}

async function main() {
  await cleanup();
  await prisma.user.create({
    data: {
      id: userId,
      email,
      role: 'member',
      companyId: 'comp-da-nang',
      version: 0,
      status: 'active',
      passwordHash: null,
      tokenVersion: 1,
      data: {
        id: userId,
        name: 'QA Legacy Plaintext',
        email,
        role: 'member',
        status: 'active',
        company_id: 'comp-da-nang',
        password: PASSWORD,
        created_at: new Date().toISOString(),
      },
    },
  });
  console.log(`[setup] seeded legacy plaintext user ${email}`);

  await startServer();
  await loginAndCheck('lần 1 (plaintext)');

  const row = await prisma.user.findUnique({ where: { id: userId } });
  const data = row?.data || {};
  const storedHash = row?.passwordHash || data.password_hash;
  assert(String(storedHash).startsWith('$argon2'), `hash chưa được nâng cấp Argon2: ${String(storedHash).slice(0, 12)}`);
  assert(!data.password, 'plaintext password vẫn còn trong users.data');

  // Restart proves the upgraded hash is what the next process loads, and the
  // plaintext value is gone for good.
  await stopServer();
  await startServer();
  await loginAndCheck('lần 2 (sau restart)');

  console.log('PASS MAN-01 legacy plaintext login → 200, /me → 200, Argon2 upgrade, plaintext removed, login survives restart');
}

main()
  .catch((err) => {
    console.error(`FAIL MAN-01 ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
    await cleanup();
    await prisma.$disconnect();
  });
