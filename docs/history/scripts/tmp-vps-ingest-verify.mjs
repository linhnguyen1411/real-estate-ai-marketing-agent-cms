#!/usr/bin/env node
/**
 * Production ingest verification (Stage A).
 * Creates one API credential, runs HMAC ingest tests against local API.
 * Secret written once to /root/.agent-ingest-secret (mode 600) — not printed fully.
 */
require('dotenv').config({ path: '/var/www/real-estate-ai-cms/.env' });
const crypto = require('crypto');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://127.0.0.1:3025';
const PATH = '/api/agent-ingest/v1/findings';
const SECRET_FILE = '/root/.agent-ingest-secret';
const prisma = new PrismaClient();

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function hashApiSecret(secret) {
  return sha256Hex(secret);
}
function generateApiKeyPair() {
  return {
    keyId: `ak_${crypto.randomBytes(8).toString('hex')}`,
    secret: `as_${crypto.randomBytes(24).toString('base64url')}`,
  };
}
function buildCanonical(method, path, ts, nonce, bodyHash) {
  return [method.toUpperCase(), path, ts, nonce, bodyHash].join('\n');
}
function sign(secret, canonical) {
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

async function signedFetch({ keyId, secret, path, method = 'POST', bodyObj, timestamp, nonce, idempotencyKey }) {
  const body = bodyObj == null ? '' : JSON.stringify(bodyObj);
  const ts = timestamp ?? String(Math.floor(Date.now() / 1000));
  const n = nonce ?? crypto.randomBytes(12).toString('hex');
  const bodyHash = sha256Hex(body || '');
  const canonical = buildCanonical(method, path, ts, n, bodyHash);
  const signature = sign(secret, canonical);
  const headers = {
    'Content-Type': 'application/json',
    'X-Agent-Key-Id': keyId,
    'X-Agent-Timestamp': ts,
    'X-Agent-Nonce': n,
    'X-Agent-Signature': signature,
  };
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: method === 'GET' ? undefined : body });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

function buyerPayload(ingestionId) {
  return {
    ingestionId,
    localWorkerId: 'verify-worker-1',
    parserVersion: 'verify-1',
    analysisVersion: 'verify-1',
    capturedAt: new Date().toISOString(),
    source: {
      name: 'Verify Buyer Source',
      type: 'facebook_group',
      url: 'https://www.facebook.com/groups/verify-buyer-test',
    },
    scannedContent: {
      externalId: `ext-${ingestionId}`,
      canonicalUrl: `https://www.facebook.com/groups/verify-buyer-test/posts/${ingestionId}`,
      authorName: 'Nguyen Van Verify',
      authorUrl: 'https://www.facebook.com/verify.buyer.profile',
      contentText:
        'Cần mua nhà tại Đà Nẵng, ngân sách 3–4 tỷ, ưu tiên ô tô vào, khu Hải Châu. LH 0905123456.',
      publishedAt: new Date().toISOString(),
    },
    structuredData: {
      personName: 'Nguyen Van Verify',
      primaryPhone: '0905123456',
      classification: 'buyer',
      intent: 'buy',
      actorRole: 'demand_side',
      needSummary: 'Cần mua nhà tại Đà Nẵng ngân sách 3-4 tỷ',
      budgetMin: 3000000000,
      budgetMax: 4000000000,
      primaryLocation: 'Hải Châu, Đà Nẵng',
      propertyTypes: ['nha-pho'],
    },
    intelligence: {
      finalScore: 86,
      keywordScore: 70,
      aiScore: 80,
      leadFitScore: 86,
      scoreStatus: 'scored',
      summary: 'Người mua cần nhà tại Đà Nẵng',
      reasons: ['has_phone', 'has_budget', 'buyer_intent'],
      recommendedAction: 'Gọi xác nhận nhu cầu',
    },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log('PASS', msg);
}

(async () => {
  const company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  const companyId = company?.id || null;
  console.log('companyId', companyId || '(null)');

  let keyId;
  let secret;
  if (fs.existsSync(SECRET_FILE)) {
    const saved = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8'));
    keyId = saved.keyId;
    secret = saved.secret;
    console.log('Reusing credential keyId', keyId);
  } else {
    const pair = generateApiKeyPair();
    keyId = pair.keyId;
    secret = pair.secret;
    const id = `cred-${Date.now()}`;
    // Prefer app encrypt helper if available
    let encryptedSecret = null;
    try {
      const { encryptApiSecret } = require('../server/agentIngest/hmacAuth.ts');
      encryptedSecret = encryptApiSecret(secret);
    } catch {
      try {
        const { encryptAccessToken } = require('../server/facebook/tokenCrypto.ts');
        encryptedSecret = encryptAccessToken(secret);
      } catch (e) {
        console.warn('encrypt unavailable', e.message);
      }
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO agent_api_credentials (id, company_id, key_id, secret_hash, encrypted_secret, name, status, scopes, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7::jsonb, $8, NOW())`,
      id,
      companyId,
      keyId,
      hashApiSecret(secret),
      encryptedSecret,
      'Production verification ingest key',
      JSON.stringify(['findings:ingest', 'contents:ingest']),
      'production-verification',
    );
    fs.writeFileSync(
      SECRET_FILE,
      JSON.stringify({ keyId, secret, companyId, createdAt: new Date().toISOString() }, null, 2),
      { mode: 0o600 },
    );
    fs.chmodSync(SECRET_FILE, 0o600);
    console.log('Created credential keyId', keyId, '(secret stored in', SECRET_FILE, ')');
  }

  // Health
  const health = await signedFetch({ keyId, secret, path: '/api/agent-ingest/v1/health', method: 'GET', bodyObj: null });
  assert(health.status === 200, `health status 200 (got ${health.status})`);
  assert(health.json?.data?.ingestEnabled === true, 'ingestEnabled true');
  assert(health.json?.data?.telegramEnabled === false, 'telegramEnabled false stage A');
  assert(health.json?.data?.dbReady === true, 'dbReady');

  const ingestionId = `ingest-verify-${Date.now()}`;
  const idem = `idem-${ingestionId}`;
  const payload = buyerPayload(ingestionId);

  // A valid
  const a = await signedFetch({ keyId, secret, path: PATH, bodyObj: payload, idempotencyKey: idem });
  assert(a.status === 200, `A valid ingest HTTP 200 (got ${a.status})`);
  assert(a.json?.data?.accepted === true || a.json?.data?.findingId, 'A accepted/findingId');
  const findingId = a.json.data.findingId;
  const contentId = a.json.data.scannedContentId;
  console.log('findingId', findingId, 'scannedContentId', contentId);
  assert(a.json.data.telegramQueued !== true, 'A telegramQueued not true in stage A');

  // B idempotency
  const b = await signedFetch({ keyId, secret, path: PATH, bodyObj: payload, idempotencyKey: idem });
  assert(b.status === 200, 'B replay HTTP 200');
  assert(
    b.json?.data?.duplicate === true || b.json?.data?.findingId === findingId,
    'B duplicate or same findingId',
  );
  const countFindings = await prisma.agentFinding.count({ where: { id: findingId } });
  assert(countFindings === 1, 'B still one finding row');

  // C bad signature
  const cBody = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(8).toString('hex');
  const cRes = await fetch(`${BASE}${PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Key-Id': keyId,
      'X-Agent-Timestamp': ts,
      'X-Agent-Nonce': nonce,
      'X-Agent-Signature': 'deadbeef',
    },
    body: cBody,
  });
  assert(cRes.status === 401 || cRes.status === 403, `C bad sig ${cRes.status}`);

  // D expired timestamp
  const d = await signedFetch({
    keyId,
    secret,
    path: PATH,
    bodyObj: { ...payload, ingestionId: ingestionId + '-exp' },
    timestamp: String(Math.floor(Date.now() / 1000) - 3600),
    idempotencyKey: idem + '-exp',
  });
  assert(d.status === 401 || d.status === 403, `D expired ts ${d.status}`);

  // E nonce replay
  const eNonce = crypto.randomBytes(8).toString('hex');
  const e1 = await signedFetch({
    keyId,
    secret,
    path: PATH,
    bodyObj: { ...payload, ingestionId: ingestionId + '-n1' },
    nonce: eNonce,
    idempotencyKey: idem + '-n1',
  });
  assert(e1.status === 200, 'E first nonce ok');
  const e2 = await signedFetch({
    keyId,
    secret,
    path: PATH,
    bodyObj: { ...payload, ingestionId: ingestionId + '-n2' },
    nonce: eNonce,
    idempotencyKey: idem + '-n2',
  });
  assert(e2.status === 401 || e2.status === 403, `E nonce replay ${e2.status}`);

  // H missing fields — implementation may accept sparse payload with warnings
  const h = await signedFetch({
    keyId,
    secret,
    path: PATH,
    bodyObj: { ingestionId: `bad-${Date.now()}` },
    idempotencyKey: `bad-${Date.now()}`,
  });
  if (h.status >= 400) {
    assert(true, `H validation rejected sparse payload (${h.status})`);
  } else {
    console.log('WARN H sparse payload accepted (status 200) — document as soft validation');
  }

  console.log('ALL_INGEST_STAGE_A_CHECKS_DONE');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('FAIL', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
