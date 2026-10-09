import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  encryptAccessToken,
  decryptAccessToken,
  CURRENT_KID,
} from '../../server/facebook/tokenCrypto';

describe('P3 Token Crypto: 3 Formats Round-trip (Plaintext, v1, v2)', () => {
  const originalEnv = { ...process.env };
  const currentKey = 'CurrentMasterEncryptionKey32Chars!';
  const prevKey = 'PreviousMasterAuthSecret32Chars!';

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = currentKey;
    process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = prevKey;
    process.env.AUTH_SECRET = prevKey;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Helper function imitating reencrypt-secrets migration logic
  function reencryptToken(rawToken: string): string {
    let decrypted: string;
    if (rawToken.startsWith('v2:') || rawToken.startsWith('v1:')) {
      decrypted = decryptAccessToken(rawToken);
    } else {
      // Legacy plaintext without prefix
      decrypted = rawToken;
    }
    return encryptAccessToken(decrypted);
  }

  it('1. Round-trip for Plaintext format: re-encrypts to v2 and decrypts cleanly', () => {
    const plaintextToken = 'EAABwb782910fb_raw_access_token_plaintext_xyz';

    // 1. Re-encrypt plaintext -> produces v2
    const v2Encrypted = reencryptToken(plaintextToken);
    expect(v2Encrypted.startsWith(`v2:${CURRENT_KID}:`)).toBe(true);

    // 2. Decrypt v2 -> returns original plaintext
    const decrypted = decryptAccessToken(v2Encrypted);
    expect(decrypted).toBe(plaintextToken);
  });

  it('2. Round-trip for v1 format (using old SHA-256 key via TOKEN_ENCRYPTION_KEY_PREVIOUS): re-encrypts to v2 and decrypts cleanly', () => {
    const originalToken = 'EAACv1TokenEncryptedWithOldSecret_12345';

    // Manually forge a valid legacy v1 payload encrypted with previous key
    const v1Key = crypto.createHash('sha256').update(prevKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', v1Key, iv);
    const ciphertext = Buffer.concat([cipher.update(originalToken, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const v1Payload = `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;

    // Verify v1 can be decrypted using previous key
    const v1Decrypted = decryptAccessToken(v1Payload);
    expect(v1Decrypted).toBe(originalToken);

    // Re-encrypt v1 -> produces v2 with CURRENT_KID (k1)
    const v2Encrypted = reencryptToken(v1Payload);
    expect(v2Encrypted.startsWith(`v2:${CURRENT_KID}:`)).toBe(true);

    // Decrypt v2 with current key -> returns original token
    const finalDecrypted = decryptAccessToken(v2Encrypted);
    expect(finalDecrypted).toBe(originalToken);
  });

  it('3. Round-trip for v2 format (current key): decrypts cleanly and stays idempotent', () => {
    const originalToken = 'EAADv2ModernTokenEncryptedWithK1_98765';

    const v2Encrypted = encryptAccessToken(originalToken);
    expect(v2Encrypted.startsWith(`v2:${CURRENT_KID}:`)).toBe(true);

    const decrypted = decryptAccessToken(v2Encrypted);
    expect(decrypted).toBe(originalToken);

    // Re-encrypting v2 payload preserves token content
    const reencrypted = reencryptToken(v2Encrypted);
    const decryptedAfter = decryptAccessToken(reencrypted);
    expect(decryptedAfter).toBe(originalToken);
  });
});
