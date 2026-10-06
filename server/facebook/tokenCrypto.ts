import crypto from 'crypto';
import { getEnv } from '../config/env';

export const CURRENT_KID = 'k1';
export const PREVIOUS_KID = 'k0';

function getMasterSecret(kid: string): string {
  if (kid === CURRENT_KID) {
    const key = getEnv().TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('Missing TOKEN_ENCRYPTION_KEY environment variable');
    }
    return key;
  }
  if (kid === PREVIOUS_KID) {
    const prev = process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
    if (!prev) {
      throw new Error('Missing TOKEN_ENCRYPTION_KEY_PREVIOUS environment variable for kid k0');
    }
    return prev;
  }
  throw new Error(`Unsupported key ID: ${kid}`);
}

function deriveKey(kid: string, context = 'facebook-token'): Buffer {
  const masterSecret = getMasterSecret(kid);
  const derived = crypto.hkdfSync(
    'sha256',
    Buffer.from(masterSecret, 'utf-8'),
    Buffer.alloc(0),
    Buffer.from(`token-secret:${context}`, 'utf-8'),
    32,
  );
  return Buffer.from(derived);
}

/**
 * Encrypt a token or sensitive credential using AES-256-GCM + HKDF with kid.
 * Output format: "v2:<kid>:<iv_b64>:<tag_b64>:<ciphertext_b64>"
 */
export function encryptAccessToken(plain: string, context = 'facebook-token'): string {
  if (!plain) return '';
  const key = deriveKey(CURRENT_KID, context);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${CURRENT_KID}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt token using AES-256-GCM.
 * Supports:
 * - "v2:<kid>:<iv>:<tag>:<data>" (current standard with key rotation support)
 * - "v1:<iv>:<tag>:<data>" (legacy v1 using SHA-256(TOKEN_ENCRYPTION_KEY) or TOKEN_ENCRYPTION_KEY_PREVIOUS)
 * Note: Plaintext without prefix throws an error (fail closed after migration).
 */
export function decryptAccessToken(payload: string, context = 'facebook-token'): string {
  if (!payload) return '';
  const trimmed = String(payload).trim();

  // v2 format: "v2:<kid>:<iv_b64>:<tag_b64>:<ciphertext_b64>"
  if (trimmed.startsWith('v2:')) {
    const parts = trimmed.split(':');
    if (parts.length !== 5) {
      throw new Error('Malformed v2 encrypted token format');
    }
    const [, kid, ivB64, tagB64, dataB64] = parts;
    const key = deriveKey(kid, context);
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  // v1 legacy format: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"
  if (trimmed.startsWith('v1:')) {
    const parts = trimmed.split(':');
    if (parts.length !== 4) {
      throw new Error('Malformed v1 encrypted token format');
    }
    const [, ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    // Try current TOKEN_ENCRYPTION_KEY first
    const currentSecret = getEnv().TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY;
    const prevSecret = process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
    const candidates = [currentSecret, prevSecret].filter(Boolean) as string[];

    for (const secret of candidates) {
      try {
        const key = crypto.createHash('sha256').update(secret).digest();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
      } catch {
        // Continue to next candidate
      }
    }
    throw new Error('Failed to decrypt v1 token: invalid authentication tag or wrong key');
  }

  // Plaintext is no longer accepted after migration (fail-closed)
  throw new Error('Invalid token payload: expected v2: or v1: encrypted token format');
}
