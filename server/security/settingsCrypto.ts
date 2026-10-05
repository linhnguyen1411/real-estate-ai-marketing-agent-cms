import crypto from 'crypto';
import { getEnv } from '../config/env';

export interface EncryptedEnvelope {
  kid: string;
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
}

const CURRENT_KID = 'k1';

/**
 * Derive domain-separated 256-bit encryption key using HKDF-SHA256 from TOKEN_ENCRYPTION_KEY.
 * Never uses AUTH_SECRET.
 */
function deriveKey(context: string): Buffer {
  const masterSecret = getEnv().TOKEN_ENCRYPTION_KEY;
  const derived = crypto.hkdfSync('sha256', Buffer.from(masterSecret, 'utf-8'), Buffer.alloc(0), Buffer.from(`settings-secret:${context}`, 'utf-8'), 32);
  return Buffer.from(derived);
}

/**
 * Encrypt a secret value using AES-256-GCM.
 * Output format: "enc:k1:<iv_b64>:<tag_b64>:<ciphertext_b64>"
 */
export function encryptSecret(plaintext: string, context: string): string {
  if (!plaintext) return '';
  const key = deriveKey(context);
  const iv = crypto.randomBytes(12); // 96-bit IV standard for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:${CURRENT_KID}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Check if a string is encrypted in "enc:..." format
 */
export function isEncryptedSecret(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.startsWith('enc:');
}

/**
 * Decrypt a secret value. If not encrypted (e.g. legacy plaintext or empty), returns value as-is.
 */
export function decryptSecret(encryptedValue: string | null | undefined, context: string): string {
  if (!encryptedValue) return '';
  const trimmed = String(encryptedValue).trim();
  if (!trimmed.startsWith('enc:')) {
    // Legacy plaintext support for seamless migration
    return trimmed;
  }

  const parts = trimmed.split(':');
  if (parts.length !== 5) {
    throw new Error('Malformed encrypted secret format');
  }

  const [, kid, ivB64, tagB64, dataB64] = parts;
  if (kid !== CURRENT_KID) {
    throw new Error(`Unsupported key ID: ${kid}`);
  }

  const key = deriveKey(context);
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Failed to decrypt secret for context "${context}": invalid auth tag or wrong key`);
  }
}
