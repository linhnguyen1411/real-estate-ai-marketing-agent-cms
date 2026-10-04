import crypto from 'crypto';

const SCRYPT_N = 32768; // 2^15
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

// List of at least 20 common weak passwords to reject
export const COMMON_PASSWORDS = new Set([
  '1234567890',
  '123456789',
  '12345678',
  'password123',
  'password1234',
  'admin12345',
  'admin123456',
  'bdsdanang123',
  'iloveyou123',
  'qwertyuiop',
  'welcome1234',
  'pass1234567',
  'sunshine123',
  'danang12345',
  'danangcity123',
  'superadmin1',
  'administrator',
  'letmein1234',
  'football123',
  'monkey12345',
  'dragon12345',
  'master12345',
]);

export interface PasswordPolicyResult {
  valid: boolean;
  message?: string;
}

export function validatePasswordPolicy(password: string, email?: string): PasswordPolicyResult {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Mật khẩu không được để trống.' };
  }

  if (password.length < 10) {
    return { valid: false, message: 'Mật khẩu phải có độ dài tối thiểu 10 ký tự.' };
  }

  const normalizedPass = password.toLowerCase().trim();

  if (COMMON_PASSWORDS.has(normalizedPass)) {
    return { valid: false, message: 'Mật khẩu quá đơn giản, vui lòng chọn mật khẩu phức tạp hơn.' };
  }

  if (email && typeof email === 'string') {
    const cleanEmail = email.toLowerCase().trim();
    const [localPart, domainPart] = cleanEmail.split('@');
    const domainPrefix = domainPart ? domainPart.split('.')[0] : '';

    if (
      normalizedPass === cleanEmail ||
      (localPart && localPart.length >= 3 && normalizedPass.includes(localPart)) ||
      (domainPrefix && domainPrefix.length >= 3 && normalizedPass.includes(domainPrefix))
    ) {
      return { valid: false, message: 'Mật khẩu không được chứa thông tin từ địa chỉ email của bạn.' };
    }
  }

  return { valid: true };
}

export async function hashPassword(plainText: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN);
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      plainText,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) return reject(err);
        const saltB64 = salt.toString('base64');
        const hashB64 = derivedKey.toString('base64');
        resolve(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${saltB64}$${hashB64}`);
      }
    );
  });
}

export async function verifyPassword(plainText: string, storedHash: string): Promise<boolean> {
  if (!plainText || !storedHash) return false;

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], 'base64');
  const expectedHash = Buffer.from(parts[5], 'base64');

  return new Promise((resolve) => {
    crypto.scrypt(
      plainText,
      salt,
      expectedHash.length,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) return resolve(false);
        if (derivedKey.length !== expectedHash.length) return resolve(false);
        try {
          resolve(crypto.timingSafeEqual(derivedKey, expectedHash));
        } catch {
          resolve(false);
        }
      }
    );
  });
}

export function verifyPlaintextLegacy(plainText: string, legacyPassword: string): boolean {
  if (!plainText || !legacyPassword) return false;
  const a = Buffer.from(plainText);
  const b = Buffer.from(legacyPassword);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function needsRehash(storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$')) return true;
  const parts = storedHash.split('$');
  if (parts.length !== 6) return true;
  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  return N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P;
}
