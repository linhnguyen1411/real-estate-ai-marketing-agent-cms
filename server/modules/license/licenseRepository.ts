import crypto from 'crypto';
import { prisma } from '../../prisma';

export interface DbLicenseKey {
  id: string;
  userId: string;
  keyHash: string;
  status: 'active' | 'revoked' | 'expired';
  maxDevices: number;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface DbLicenseDevice {
  id: string;
  licenseKeyId: string;
  deviceId: string;
  deviceName: string | null;
  activatedAt: Date;
  lastHeartbeatAt: Date;
}

// In-memory fallback stores
const memoryLicenseKeys = new Map<string, DbLicenseKey>(); // key: id
const memoryLicenseDevices = new Map<string, DbLicenseDevice>(); // key: licenseKeyId:deviceId

function shouldUsePrisma(): boolean {
  if (process.env.NODE_ENV === 'test' && !process.env.TEST_USE_PRISMA) {
    return false;
  }
  return !!process.env.DATABASE_URL;
}

export async function createLicenseKey(data: {
  userId: string;
  keyHash: string;
  maxDevices?: number;
}): Promise<DbLicenseKey> {
  const licenseKey: DbLicenseKey = {
    id: `lk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    userId: data.userId,
    keyHash: data.keyHash,
    status: 'active',
    maxDevices: data.maxDevices ?? 1,
    createdAt: new Date(),
    revokedAt: null,
  };

  if (shouldUsePrisma()) {
    try {
      await prisma.licenseKey.create({
        data: {
          id: licenseKey.id,
          userId: licenseKey.userId,
          keyHash: licenseKey.keyHash,
          status: licenseKey.status,
          maxDevices: licenseKey.maxDevices,
          createdAt: licenseKey.createdAt,
          revokedAt: licenseKey.revokedAt,
        },
      });
      return licenseKey;
    } catch {
      // Fallback
    }
  }

  memoryLicenseKeys.set(licenseKey.id, licenseKey);
  return licenseKey;
}

export async function findLicenseKeyByHash(keyHash: string): Promise<DbLicenseKey | null> {
  if (shouldUsePrisma()) {
    try {
      const found = await prisma.licenseKey.findUnique({
        where: { keyHash },
      });
      if (found) return found as DbLicenseKey;
    } catch {
      // Fallback
    }
  }

  for (const lk of memoryLicenseKeys.values()) {
    if (lk.keyHash === keyHash) return lk;
  }
  return null;
}

export async function findLicenseKeyById(id: string): Promise<DbLicenseKey | null> {
  if (shouldUsePrisma()) {
    try {
      const found = await prisma.licenseKey.findUnique({
        where: { id },
      });
      if (found) return found as DbLicenseKey;
    } catch {
      // Fallback
    }
  }
  return memoryLicenseKeys.get(id) || null;
}

export async function findLicenseKeysByUserId(userId: string): Promise<DbLicenseKey[]> {
  if (shouldUsePrisma()) {
    try {
      const rows = await prisma.licenseKey.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (rows && rows.length > 0) return rows as DbLicenseKey[];
    } catch {
      // Fallback
    }
  }

  const result: DbLicenseKey[] = [];
  for (const lk of memoryLicenseKeys.values()) {
    if (lk.userId === userId) result.push(lk);
  }
  return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function listAllLicenseKeys(): Promise<DbLicenseKey[]> {
  if (shouldUsePrisma()) {
    try {
      const rows = await prisma.licenseKey.findMany({
        orderBy: { createdAt: 'desc' },
      });
      if (rows) return rows as DbLicenseKey[];
    } catch {
      // Fallback
    }
  }
  return Array.from(memoryLicenseKeys.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export async function revokeLicenseKey(id: string): Promise<boolean> {
  const now = new Date();
  if (shouldUsePrisma()) {
    try {
      await prisma.licenseKey.update({
        where: { id },
        data: {
          status: 'revoked',
          revokedAt: now,
        },
      });
      return true;
    } catch {
      // Fallback
    }
  }

  const existing = memoryLicenseKeys.get(id);
  if (existing) {
    existing.status = 'revoked';
    existing.revokedAt = now;
    return true;
  }
  return false;
}

export async function findDevice(
  licenseKeyId: string,
  deviceId: string
): Promise<DbLicenseDevice | null> {
  if (shouldUsePrisma()) {
    try {
      const found = await prisma.licenseDevice.findUnique({
        where: {
          licenseKeyId_deviceId: { licenseKeyId, deviceId },
        },
      });
      if (found) return found as DbLicenseDevice;
    } catch {
      // Fallback
    }
  }
  return memoryLicenseDevices.get(`${licenseKeyId}:${deviceId}`) || null;
}

export async function countActiveDevices(licenseKeyId: string): Promise<number> {
  if (shouldUsePrisma()) {
    try {
      const count = await prisma.licenseDevice.count({
        where: { licenseKeyId },
      });
      return count;
    } catch {
      // Fallback
    }
  }

  let count = 0;
  for (const dev of memoryLicenseDevices.values()) {
    if (dev.licenseKeyId === licenseKeyId) count++;
  }
  return count;
}

export async function getDevicesForLicense(licenseKeyId: string): Promise<DbLicenseDevice[]> {
  if (shouldUsePrisma()) {
    try {
      const rows = await prisma.licenseDevice.findMany({
        where: { licenseKeyId },
        orderBy: { activatedAt: 'asc' },
      });
      if (rows) return rows as DbLicenseDevice[];
    } catch {
      // Fallback
    }
  }

  const result: DbLicenseDevice[] = [];
  for (const dev of memoryLicenseDevices.values()) {
    if (dev.licenseKeyId === licenseKeyId) result.push(dev);
  }
  return result.sort((a, b) => a.activatedAt.getTime() - b.activatedAt.getTime());
}

export async function upsertDevice(data: {
  licenseKeyId: string;
  deviceId: string;
  deviceName?: string;
}): Promise<DbLicenseDevice> {
  const now = new Date();
  if (shouldUsePrisma()) {
    try {
      const row = await prisma.licenseDevice.upsert({
        where: {
          licenseKeyId_deviceId: {
            licenseKeyId: data.licenseKeyId,
            deviceId: data.deviceId,
          },
        },
        create: {
          licenseKeyId: data.licenseKeyId,
          deviceId: data.deviceId,
          deviceName: data.deviceName || null,
          activatedAt: now,
          lastHeartbeatAt: now,
        },
        update: {
          deviceName: data.deviceName || undefined,
          lastHeartbeatAt: now,
        },
      });
      return row as DbLicenseDevice;
    } catch {
      // Fallback
    }
  }

  const key = `${data.licenseKeyId}:${data.deviceId}`;
  const existing = memoryLicenseDevices.get(key);
  if (existing) {
    existing.deviceName = data.deviceName || existing.deviceName;
    existing.lastHeartbeatAt = now;
    return existing;
  }

  const newDevice: DbLicenseDevice = {
    id: `ld-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    licenseKeyId: data.licenseKeyId,
    deviceId: data.deviceId,
    deviceName: data.deviceName || null,
    activatedAt: now,
    lastHeartbeatAt: now,
  };
  memoryLicenseDevices.set(key, newDevice);
  return newDevice;
}

export async function updateDeviceHeartbeat(
  licenseKeyId: string,
  deviceId: string
): Promise<DbLicenseDevice | null> {
  const now = new Date();
  if (shouldUsePrisma()) {
    try {
      const row = await prisma.licenseDevice.update({
        where: {
          licenseKeyId_deviceId: { licenseKeyId, deviceId },
        },
        data: {
          lastHeartbeatAt: now,
        },
      });
      return row as DbLicenseDevice;
    } catch {
      // Fallback
    }
  }

  const key = `${licenseKeyId}:${deviceId}`;
  const existing = memoryLicenseDevices.get(key);
  if (existing) {
    existing.lastHeartbeatAt = now;
    return existing;
  }
  return null;
}

export function seedMockLicenseKeyForTesting(key: DbLicenseKey): void {
  memoryLicenseKeys.set(key.id, key);
}

export function seedMockLicenseDeviceForTesting(dev: DbLicenseDevice): void {
  memoryLicenseDevices.set(`${dev.licenseKeyId}:${dev.deviceId}`, dev);
}

export function clearMockLicensesForTesting(): void {
  memoryLicenseKeys.clear();
  memoryLicenseDevices.clear();
}
