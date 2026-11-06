import crypto from 'crypto';
import {
  getActiveEntitlements,
  createEntitlement,
  getTeamMember,
  getTeamById,
} from '../rbac/rbacRepository';
import { resolvePermissions } from '../rbac/rbacService';
import { prisma } from '../../prisma';
import {
  createLicenseKey,
  findLicenseKeyByHash,
  findLicenseKeyById,
  findLicenseKeysByUserId,
  updateLicenseKeySecret,
  updateLicenseKeyMaxDevices,
  upsertDevice,
  countActiveDevices,
  updateDeviceHeartbeat,
  type DbLicenseKey,
  type DbLicenseDevice,
} from './licenseRepository';
import { buildAgentCapabilities, type AgentCapabilities } from './agentCapabilities';
import {
  provisionDesktopIngestCredential,
  type ProvisionedIngestCredential,
} from './agentProvisioning';

export interface DeviceTokenPayload {
  userId: string;
  licenseKeyId: string;
  deviceId: string;
  type: 'device_access' | 'device_refresh';
  exp: number; // Unix timestamp in seconds
}

export interface ActivationUserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  roleKey: string;
  roleLabel: string;
  companyId: string | null;
  teamId: string | null;
  portal: 'admin' | 'my';
}

export interface ActivationResult {
  success: boolean;
  code?: string;
  message?: string;
  data?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // seconds
    offlineGraceHours: number;
    plan: string;
    features: string[];
    maxDevices: number;
    expiresAt: string | null;
    user: ActivationUserProfile;
    capabilities: AgentCapabilities;
    server: { vpsUrl: string; downloadUrl: string };
    ingest: ProvisionedIngestCredential;
  };
}

const SECRET = process.env.AUTH_SECRET || process.env.TOKEN_ENCRYPTION_KEY || 'dev-ephemeral-license-secret-32-chars-long';

/**
 * Generate a 16-character alphanumeric license key in format XXXX-XXXX-XXXX-XXXX.
 * Ambiguous characters (O, 0, 1, I) are excluded so users can type it by hand.
 */
export function generateRawLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  let str = '';
  for (let i = 0; i < 16; i++) {
    str += chars[bytes[i] % chars.length];
  }
  return `${str.slice(0, 4)}-${str.slice(4, 8)}-${str.slice(8, 12)}-${str.slice(12, 16)}`;
}

const LICENSE_CIPHER_PREFIX = 'lkenc:v1';

function getLicenseEncryptionKey(): Buffer {
  const secret =
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    SECRET;
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(secret, 'utf8'),
      Buffer.alloc(0),
      Buffer.from('houseandlife:license-key:v1', 'utf8'),
      32,
    ),
  );
}

/** Encrypt the raw key at rest with AES-256-GCM (domain-separated key). */
export function encryptLicenseKey(rawKey: string): string {
  const key = getLicenseEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${LICENSE_CIPHER_PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/** Returns null for missing/legacy hash-only rows or unreadable ciphertext. */
export function decryptLicenseKey(payload: string | null | undefined): string | null {
  if (!payload || !payload.startsWith(`${LICENSE_CIPHER_PREFIX}:`)) return null;
  try {
    const parts = payload.split(':');
    if (parts.length !== 5) return null;
    const [, , ivB64, tagB64, dataB64] = parts;
    const key = getLicenseEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Ensure the account owns exactly one active license key and return its raw
 * value. Legacy hash-only keys are rotated in place (same row) so the account
 * still never ends up with a second key.
 */
export async function ensureUserLicenseKey(params: {
  userId: string;
  maxDevices?: number;
}): Promise<{ key: DbLicenseKey; rawKey: string; created: boolean; rotated: boolean }> {
  const existing = await findLicenseKeysByUserId(params.userId);
  const active = existing.find((k) => k.status === 'active');

  if (!active) {
    // One key per account, forever: revoked/expired keys must never be
    // silently reactivated or replaced by a new key.
    if (existing.length > 0) {
      const error: any = new Error('Khóa bản quyền của tài khoản đã bị thu hồi hoặc hết hiệu lực.');
      error.code = 'KEY_REVOKED';
      throw error;
    }

    const newRawKey = generateRawLicenseKey();
    try {
      const created = await createLicenseKey({
        userId: params.userId,
        keyHash: hashLicenseKey(newRawKey),
        keyCipher: encryptLicenseKey(newRawKey),
        maxDevices: params.maxDevices ?? 1,
      });
      return { key: created, rawKey: newRawKey, created: true, rotated: false };
    } catch (error: any) {
      // Lost a concurrent issuance race: the partial unique index guarantees
      // the winner is the account's only active key, so read it back.
      if (error?.code === 'P2002') {
        return ensureUserLicenseKey(params);
      }
      throw error;
    }
  }

  const storedRaw = decryptLicenseKey(active.keyCipher);
  if (storedRaw) {
    let key = active;
    if (params.maxDevices !== undefined && params.maxDevices !== active.maxDevices) {
      key = (await updateLicenseKeyMaxDevices(active.id, params.maxDevices)) || active;
    }
    return { key, rawKey: storedRaw, created: false, rotated: false };
  }

  const rotatedRawKey = generateRawLicenseKey();
  const rotated = await updateLicenseKeySecret(active.id, {
    keyHash: hashLicenseKey(rotatedRawKey),
    keyCipher: encryptLicenseKey(rotatedRawKey),
    maxDevices: params.maxDevices ?? active.maxDevices,
  });
  if (!rotated) {
    const error: any = new Error('Không thể khôi phục khóa bản quyền. Vui lòng thử lại.');
    error.code = 'LICENSE_ROTATE_FAILED';
    throw error;
  }
  return { key: rotated, rawKey: rotatedRawKey, created: true, rotated: true };
}

/**
 * Hash raw license key using SHA-256
 */
export function hashLicenseKey(rawKey: string): string {
  const normalized = rawKey.trim().toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Sign a device token (HMAC-SHA256)
 */
export function signDeviceToken(payload: DeviceTokenPayload): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Verify device token and ensure it belongs to expected deviceId
 */
export function verifyDeviceToken(
  token: string,
  expectedDeviceId: string,
  expectedType: 'device_access' | 'device_refresh'
): { valid: boolean; payload?: DeviceTokenPayload; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Token không đúng định dạng' };
    }
    const [headerB64, bodyB64, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', SECRET)
      .update(`${headerB64}.${bodyB64}`)
      .digest('base64url');

    // Constant-time comparison
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return { valid: false, error: 'Chữ ký token không hợp lệ' };
    }

    const payload: DeviceTokenPayload = JSON.parse(
      Buffer.from(bodyB64, 'base64url').toString('utf8')
    );

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'Token đã hết hạn' };
    }

    if (payload.type !== expectedType) {
      return { valid: false, error: 'Loại token không đúng' };
    }

    // Critical security check: token issued for device A cannot be used on device B!
    if (payload.deviceId !== expectedDeviceId) {
      return {
        valid: false,
        error: 'Token thiết bị không khớp với thiết bị gửi yêu cầu (Thiết bị bị từ chối)',
      };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Token không hợp lệ' };
  }
}

/**
 * Checks if user (or approved team) has active entitlement for 'tool.exe'
 */
export async function checkToolEntitlement(
  userId: string
): Promise<{ hasAccess: boolean; plan: string; features: string[]; expiresAt?: Date }> {
  // 1. Check user direct entitlements
  const now = new Date();
  const userEnts = await getActiveEntitlements('user', userId, now);
  for (const ent of userEnts) {
    if (ent.expiresAt > now) {
      const features = Array.isArray(ent.features) ? ent.features : [];
      if (features.includes('tool.exe') || features.includes('*')) {
        return { hasAccess: true, plan: ent.plan, features, expiresAt: ent.expiresAt };
      }
    }
  }

  // 2. Check team entitlements if user is approved member
  const member = await getTeamMember(userId);
  if (member && member.status === 'approved') {
    const team = await getTeamById(member.teamId);
    if (team) {
      if (team.isPlatformRoot) {
        return {
          hasAccess: true,
          plan: 'platform_root',
          features: ['*'],
          expiresAt: new Date(Date.now() + 365 * 86400_000),
        };
      }
      const teamEnts = await getActiveEntitlements('team', member.teamId, now);
      for (const ent of teamEnts) {
        if (ent.expiresAt > now) {
          const features = Array.isArray(ent.features) ? ent.features : [];
          if (features.includes('tool.exe') || features.includes('*')) {
            return { hasAccess: true, plan: ent.plan, features, expiresAt: ent.expiresAt };
          }
        }
      }
    }
  }

  return { hasAccess: false, plan: 'none', features: [] };
}

/**
 * Provision the one-time 3-day Premium Trial entitlement. Trial can only be
 * consumed once per account, even after it expires.
 */
export async function ensureTrialEntitlement(
  userId: string
): Promise<{ plan: string; features: string[]; expiresAt: Date; alreadyUsed?: boolean }> {
  const current = await checkToolEntitlement(userId);
  if (current.hasAccess && current.expiresAt) {
    return { plan: current.plan, features: current.features, expiresAt: current.expiresAt };
  }

  const { findEntitlementsBySubject } = await import('../rbac/rbacRepository');
  const previousTrials = await findEntitlementsBySubject('user', userId, ['trial', 'premium_trial']);
  if (previousTrials.length > 0) {
    const latest = previousTrials.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
    return {
      plan: latest.plan,
      features: [],
      expiresAt: latest.expiresAt,
      alreadyUsed: true,
    };
  }

  const startsAt = new Date();
  const expiresAt = new Date(Date.now() + 3 * 86400_000); // 3 days trial
  const features = ['tool.exe'];

  await createEntitlement({
    subjectType: 'user',
    subjectId: userId,
    plan: 'premium_trial',
    features,
    startsAt,
    expiresAt,
    source: 'license',
    grantedBy: null,
  });

  return { plan: 'premium_trial', features, expiresAt };
}

/**
 * Activate license for a device
 */
export async function activateLicense(params: {
  rawKey: string;
  deviceId: string;
  deviceName?: string;
}): Promise<ActivationResult> {
  const keyHash = hashLicenseKey(params.rawKey);
  const licenseKey = await findLicenseKeyByHash(keyHash);

  if (!licenseKey) {
    return {
      success: false,
      code: 'INVALID_KEY',
      message: 'Khóa bản quyền không hợp lệ hoặc không tồn tại.',
    };
  }

  if (licenseKey.status === 'revoked') {
    return {
      success: false,
      code: 'KEY_REVOKED',
      message: 'Khóa bản quyền đã bị thu hồi bởi quản trị viên.',
    };
  }

  if (licenseKey.status === 'expired') {
    return {
      success: false,
      code: 'KEY_EXPIRED',
      message: 'Khóa bản quyền đã hết hạn.',
    };
  }

  // Pending member check
  const member = await getTeamMember(licenseKey.userId);
  if (member && member.status === 'pending') {
    return {
      success: false,
      code: 'PENDING_MEMBER',
      message: 'Tài khoản đang ở trạng thái chờ duyệt (pending), không thể kích hoạt công cụ.',
    };
  }

  // Entitlement check
  const entitlement = await checkToolEntitlement(licenseKey.userId);
  if (!entitlement.hasAccess) {
    return {
      success: false,
      code: 'ENTITLEMENT_EXPIRED',
      message: 'Gói bản quyền (tool.exe) đã hết hạn hoặc chưa được cấp phép.',
    };
  }

  // Device limit check
  const existingDevice = await upsertDevice({
    licenseKeyId: licenseKey.id,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
  });

  const activeCount = await countActiveDevices(licenseKey.id);
  if (activeCount > licenseKey.maxDevices) {
    return {
      success: false,
      code: 'MAX_DEVICES_EXCEEDED',
      message: `Đã vượt quá giới hạn thiết bị kích hoạt (tối đa ${licenseKey.maxDevices} thiết bị).`,
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const accessExp = nowSec + 2 * 3600; // 2 hours
  const refreshExp = nowSec + 30 * 86400; // 30 days

  const accessToken = signDeviceToken({
    userId: licenseKey.userId,
    licenseKeyId: licenseKey.id,
    deviceId: params.deviceId,
    type: 'device_access',
    exp: accessExp,
  });

  const refreshToken = signDeviceToken({
    userId: licenseKey.userId,
    licenseKeyId: licenseKey.id,
    deviceId: params.deviceId,
    type: 'device_refresh',
    exp: refreshExp,
  });

  const userRow = await prisma.user.findUnique({
    where: { id: licenseKey.userId },
    select: { id: true, email: true, role: true, companyId: true, data: true },
  });
  if (!userRow) {
    return {
      success: false,
      code: 'ACCOUNT_NOT_FOUND',
      message: 'Không tìm thấy tài khoản sở hữu khóa bản quyền.',
    };
  }

  const userData = (userRow.data as Record<string, unknown>) || {};
  const profileName = String(userData.name || userData.full_name || userRow.email || '');
  const resolved = await resolvePermissions({
    id: userRow.id,
    role: userRow.role,
    email: userRow.email,
    company_id: userRow.companyId || undefined,
  });
  const capabilities = buildAgentCapabilities(resolved, entitlement.features);

  if (!capabilities.canScan) {
    return {
      success: false,
      code: 'AGENT_NOT_ALLOWED',
      message:
        resolved.roleKey === 'pending_member'
          ? 'Tài khoản đang chờ duyệt nên chưa được dùng Desktop Agent.'
          : 'Tài khoản chưa được cấp quyền sử dụng Desktop Agent.',
    };
  }

  const ingest = await provisionDesktopIngestCredential({
    userId: userRow.id,
    deviceId: params.deviceId,
    companyId: userRow.companyId || null,
    capabilities,
    expiresAt: entitlement.expiresAt ?? null,
  });

  const vpsUrl = (process.env.APP_URL || 'https://bdsdanang.site').replace(/\/+$/, '');

  return {
    success: true,
    data: {
      accessToken,
      refreshToken,
      expiresIn: 7200,
      offlineGraceHours: 48,
      plan: entitlement.plan,
      features: entitlement.features,
      maxDevices: licenseKey.maxDevices,
      expiresAt: entitlement.expiresAt ? entitlement.expiresAt.toISOString() : null,
      user: {
        id: userRow.id,
        name: profileName,
        email: userRow.email,
        role: userRow.role,
        roleKey: capabilities.roleKey,
        roleLabel: capabilities.roleLabel,
        companyId: userRow.companyId || null,
        teamId: resolved.teamId || null,
        portal: capabilities.portal,
      },
      capabilities,
      server: {
        vpsUrl,
        downloadUrl: '/downloads/HouseAndLife-Agent-Setup.exe',
      },
      ingest,
    },
  };
}

/**
 * Heartbeat check & ping
 */
export async function processHeartbeat(params: {
  token: string;
  deviceId: string;
}): Promise<{
  valid: boolean;
  code?: string;
  message?: string;
  expiresAt?: Date;
  userId?: string;
  plan?: string;
  features?: string[];
}> {
  const verified = verifyDeviceToken(params.token, params.deviceId, 'device_access');
  if (!verified.valid || !verified.payload) {
    return { valid: false, code: 'INVALID_TOKEN', message: verified.error };
  }

  const licenseKey = await findLicenseKeyById(verified.payload.licenseKeyId);
  if (!licenseKey || licenseKey.status !== 'active') {
    return {
      valid: false,
      code: 'KEY_REVOKED',
      message: 'Khóa bản quyền đã bị thu hồi hoặc không còn hiệu lực.',
    };
  }

  const entitlement = await checkToolEntitlement(licenseKey.userId);
  if (!entitlement.hasAccess) {
    return {
      valid: false,
      code: 'ENTITLEMENT_EXPIRED',
      message: 'Gói dịch vụ đã hết hạn.',
    };
  }

  await updateDeviceHeartbeat(licenseKey.id, params.deviceId);

  return {
    valid: true,
    expiresAt: entitlement.expiresAt,
    userId: licenseKey.userId,
    plan: entitlement.plan,
    features: entitlement.features,
  };
}

/**
 * Refresh device access token
 */
export async function refreshDeviceAccessToken(params: {
  refreshToken: string;
  deviceId: string;
}): Promise<{ success: boolean; code?: string; message?: string; accessToken?: string; expiresIn?: number }> {
  const verified = verifyDeviceToken(params.refreshToken, params.deviceId, 'device_refresh');
  if (!verified.valid || !verified.payload) {
    return { success: false, code: 'INVALID_REFRESH_TOKEN', message: verified.error };
  }

  const licenseKey = await findLicenseKeyById(verified.payload.licenseKeyId);
  if (!licenseKey || licenseKey.status !== 'active') {
    return {
      success: false,
      code: 'KEY_REVOKED',
      message: 'Khóa bản quyền đã bị thu hồi.',
    };
  }

  const entitlement = await checkToolEntitlement(licenseKey.userId);
  if (!entitlement.hasAccess) {
    return {
      success: false,
      code: 'ENTITLEMENT_EXPIRED',
      message: 'Gói dịch vụ đã hết hạn.',
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const accessExp = nowSec + 2 * 3600;

  const accessToken = signDeviceToken({
    userId: licenseKey.userId,
    licenseKeyId: licenseKey.id,
    deviceId: params.deviceId,
    type: 'device_access',
    exp: accessExp,
  });

  return {
    success: true,
    accessToken,
    expiresIn: 7200,
  };
}
