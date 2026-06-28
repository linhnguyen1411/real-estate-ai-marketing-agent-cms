import crypto from 'crypto';

function getEncryptionKey(): Buffer | null {
  const secret =
    process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    process.env.FACEBOOK_APP_SECRET;
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptAccessToken(plain: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('Missing encryption key for Facebook access token');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptAccessToken(payload: string): string {
  if (!payload.startsWith('v1:')) return payload;
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('Missing encryption key for Facebook access token');
  }
  const [, ivB64, tagB64, dataB64] = payload.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
