import crypto from 'crypto';
import {
  getActiveEntitlements,
  createEntitlement,
  getTeamMember,
  getTeamById,
} from '../rbac/rbacRepository';
import {
  createLicenseKey,
  findLicenseKeyByHash,
  findLicenseKeyById,
  upsertDevice,
  countActiveDevices,
  updateDeviceHeartbeat,
  type DbLicenseKey,
  type DbLicenseDevice,
} from './licenseRepository';

export interface DeviceTokenPayload {
  userId: string;
  licenseKeyId: string;
  deviceId: string;
  type: 'device_access' | 'device_refresh';
  exp: number; // Unix timestamp in seconds
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
  };
}

const SECRET = process.env.AUTH_SECRET || process.env.TOKEN_ENCRYPTION_KEY || 'dev-ephemeral-license-secret-32-chars-long';

/**
 * Generate a 16-character alphanumeric license key in format HL-XXXX-XXXX-XXXX
 */
export function generateRawLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Base32 without ambiguous chars (O, 0, 1, I)
  const bytes = crypto.randomBytes(12);
  let str = '';
  for (let i = 0; i < 12; i++) {
    str += chars[bytes[i] % chars.length];
  }
  return `HL-${str.slice(0, 4)}-${str.slice(4, 8)}-${str.slice(8, 12)}`;
}

/**
 * Hash raw license key using SHA-256
 */
export function hashLicenseKey(rawKey: string): string {
  const normalized = rawKey.trim().toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generate formatted PEM certificate string for Desktop Agent
 */
export function generateLicensePem(params: {
  licenseKey: string;
  userId: string;
  userEmail?: string;
  plan?: string;
  expiresAt?: string | Date;
  maxDevices?: number;
}): string {
  const payload = {
    iss: 'HouseAndLife-Agent-Authority',
    sub: params.userId,
    email: params.userEmail || 'agent@houseandlife.com',
    licenseKey: params.licenseKey,
    plan: (params.plan || 'trial').toUpperCase(),
    maxDevices: params.maxDevices || 1,
    expiresAt: params.expiresAt
      ? new Date(params.expiresAt).toISOString()
      : new Date(Date.now() + 3 * 86400_000).toISOString(),
    issuedAt: new Date().toISOString(),
  };
  const jsonStr = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', SECRET).update(jsonStr).digest('hex');
  const base64Body = Buffer.from(JSON.stringify({ ...payload, sig: signature })).toString('base64');
  const wrapped = base64Body.match(/.{1,64}/g)?.join('\n') || base64Body;

  return [
    '-----BEGIN AGENT LICENSE CERTIFICATE-----',
    `License-Key: ${params.licenseKey}`,
    `Subject: ${params.userEmail || params.userId}`,
    `Plan: ${(params.plan || 'trial').toUpperCase()}`,
    `Expires: ${payload.expiresAt}`,
    wrapped,
    '-----END AGENT LICENSE CERTIFICATE-----',
  ].join('\n');
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
 * Provision 3-day trial entitlement for first download
 */
export async function ensureTrialEntitlement(
  userId: string
): Promise<{ plan: string; features: string[]; expiresAt: Date }> {
  const current = await checkToolEntitlement(userId);
  if (current.hasAccess && current.expiresAt) {
    return { plan: current.plan, features: current.features, expiresAt: current.expiresAt };
  }

  const startsAt = new Date();
  const expiresAt = new Date(Date.now() + 3 * 86400_000); // 3 days trial
  const features = ['tool.exe'];

  await createEntitlement({
    subjectType: 'user',
    subjectId: userId,
    plan: 'trial',
    features,
    startsAt,
    expiresAt,
    source: 'license',
    grantedBy: null,
  });

  return { plan: 'trial', features, expiresAt };
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
    },
  };
}

/**
 * Heartbeat check & ping
 */
export async function processHeartbeat(params: {
  token: string;
  deviceId: string;
}): Promise<{ valid: boolean; code?: string; message?: string; expiresAt?: Date }> {
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
