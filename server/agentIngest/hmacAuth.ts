import crypto from 'crypto';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { decryptAccessToken, encryptAccessToken } from '../facebook/tokenCrypto';

const DEFAULT_SKEW_SECONDS = Number(process.env.AGENT_INGEST_TIMESTAMP_SKEW_SECONDS || 300);
const NONCE_TTL_MS = Number(process.env.AGENT_INGEST_NONCE_TTL_MS || 10 * 60 * 1000);

export type HmacAuthSuccess = {
  ok: true;
  keyId: string;
  companyId: string | null;
  credentialId: string;
  scopes: string[];
};

export type HmacAuthFailure = {
  ok: false;
  status: number;
  message: string;
};

export type HmacAuthResult = HmacAuthSuccess | HmacAuthFailure;

export function hashApiSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function generateApiKeyPair(): { keyId: string; secret: string } {
  const keyId = `ak_${crypto.randomBytes(8).toString('hex')}`;
  const secret = `as_${crypto.randomBytes(24).toString('base64url')}`;
  return { keyId, secret };
}

export function encryptApiSecret(secret: string): string | null {
  try {
    return encryptAccessToken(secret);
  } catch {
    return null;
  }
}

export function decryptApiSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return decryptAccessToken(payload);
  } catch {
    return null;
  }
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function buildCanonicalString(input: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodyHash: string;
}): string {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    input.bodyHash,
  ].join('\n');
}

export function signCanonical(secret: string, canonical: string): string {
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

async function storeNonce(keyId: string, nonce: string, expiresAt: Date): Promise<boolean> {
  try {
    await prisma.agentIngestNonce.create({
      data: { keyId, nonce, expiresAt },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}

/** Best-effort cleanup of expired nonces (non-blocking callers). */
export async function purgeExpiredIngestNonces(): Promise<number> {
  const result = await prisma.agentIngestNonce.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

function parseScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return ['findings:ingest'];
}

function getHeader(req: Request, name: string): string {
  const raw = req.header(name) || req.header(name.toLowerCase()) || '';
  return String(raw).trim();
}

function resolveRequestPath(req: Request): string {
  const original = typeof req.originalUrl === 'string' ? req.originalUrl : req.url || '';
  const pathOnly = original.split('?')[0] || req.path || '';
  return pathOnly;
}

function resolveBodyRaw(req: Request): Buffer {
  const anyReq = req as Request & { rawBody?: Buffer | string };
  if (Buffer.isBuffer(anyReq.rawBody)) return anyReq.rawBody;
  if (typeof anyReq.rawBody === 'string') return Buffer.from(anyReq.rawBody, 'utf8');
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  if (req.body == null) return Buffer.from('', 'utf8');
  // GET / health often has body={} from json middleware — treat empty object as empty body
  if (typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).length === 0) {
    return Buffer.from('', 'utf8');
  }
  return Buffer.from(JSON.stringify(req.body), 'utf8');
}

/**
 * Verify HMAC-SHA256 ingest request:
 * headers X-Agent-Key-Id, X-Agent-Timestamp, X-Agent-Nonce, X-Agent-Signature
 * canonical = method\\npath\\ntimestamp\\nnonce\\nsha256(body)
 */
export async function verifyIngestHmac(
  req: Request,
  options?: { skewSeconds?: number; requiredScope?: string },
): Promise<HmacAuthResult> {
  const keyId = getHeader(req, 'X-Agent-Key-Id');
  const timestamp = getHeader(req, 'X-Agent-Timestamp');
  const nonce = getHeader(req, 'X-Agent-Nonce');
  const signature = getHeader(req, 'X-Agent-Signature');

  if (!keyId || !timestamp || !nonce || !signature) {
    return { ok: false, status: 401, message: 'Missing HMAC headers.' };
  }

  const skewSeconds = options?.skewSeconds ?? DEFAULT_SKEW_SECONDS;
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, status: 401, message: 'Invalid timestamp.' };
  }
  // Accept seconds or milliseconds
  const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
  const drift = Math.abs(Date.now() - tsMs);
  if (drift > skewSeconds * 1000) {
    return { ok: false, status: 401, message: 'Timestamp skew too large.' };
  }

  const credential = await prisma.agentApiCredential.findUnique({ where: { keyId } });
  if (!credential || credential.status !== 'active' || credential.revokedAt) {
    return { ok: false, status: 401, message: 'Invalid API key.' };
  }
  if (credential.expiresAt && credential.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 401, message: 'API key expired.' };
  }

  const scopes = parseScopes(credential.scopes);
  const requiredScope = options?.requiredScope || 'findings:ingest';
  if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes('*')) {
    return { ok: false, status: 403, message: 'Insufficient scope.' };
  }

  const allowedIps = Array.isArray(credential.allowedIps)
    ? (credential.allowedIps as unknown[]).map(String)
    : null;
  if (allowedIps && allowedIps.length) {
    const ip = String(req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (!allowedIps.includes(ip) && !allowedIps.includes('*')) {
      return { ok: false, status: 403, message: 'IP not allowed.' };
    }
  }

  const secret =
    decryptApiSecret(credential.encryptedSecret) ||
    // Fallback: if encryptedSecret missing, reject (cannot verify with hash alone for HMAC)
    null;
  if (!secret) {
    return { ok: false, status: 401, message: 'Credential secret unavailable.' };
  }

  // Optional integrity check against stored hash
  const expectedHash = hashApiSecret(secret);
  if (!timingSafeEqualString(expectedHash, credential.secretHash)) {
    return { ok: false, status: 401, message: 'Credential integrity check failed.' };
  }

  const bodyBuf = resolveBodyRaw(req);
  const bodyHash = sha256Hex(bodyBuf);
  const canonical = buildCanonicalString({
    method: req.method || 'POST',
    path: resolveRequestPath(req),
    timestamp,
    nonce,
    bodyHash,
  });
  const expectedSig = signCanonical(secret, canonical);
  if (!timingSafeEqualString(expectedSig.toLowerCase(), signature.toLowerCase())) {
    return { ok: false, status: 401, message: 'Invalid signature.' };
  }

  const nonceOk = await storeNonce(
    keyId,
    nonce,
    new Date(Date.now() + NONCE_TTL_MS),
  );
  if (!nonceOk) {
    return { ok: false, status: 401, message: 'Nonce already used (replay).' };
  }

  // Fire-and-forget purge occasionally
  if (Math.random() < 0.05) {
    void purgeExpiredIngestNonces().catch(() => undefined);
  }

  await prisma.agentApiCredential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => undefined);

  return {
    ok: true,
    keyId,
    companyId: credential.companyId,
    credentialId: credential.id,
    scopes,
  };
}
