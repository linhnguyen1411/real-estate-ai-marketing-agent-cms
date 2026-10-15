import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getAuthUser } from '../auth/authAccess';
import { findTeamMember } from '../rbac/rbacRepository';
import { requirePermission } from '../rbac/rbacMiddleware';
import { validateSchema } from '../../middleware/validation';
import {
  generateRawLicenseKey,
  hashLicenseKey,
  ensureTrialEntitlement,
  activateLicense,
  processHeartbeat,
  refreshDeviceAccessToken,
} from './licenseService';
import {
  createLicenseKey,
  findLicenseKeysByUserId,
  listAllLicenseKeys,
  revokeLicenseKey,
  getDevicesForLicense,
} from './licenseRepository';

const activateSchema = z.object({
  key: z.string().trim().min(5, 'Khóa bản quyền không hợp lệ.'),
  deviceId: z.string().trim().min(3, 'Mã định danh thiết bị (deviceId) là bắt buộc.'),
  deviceName: z.string().trim().optional(),
});

const heartbeatSchema = z.object({
  deviceId: z.string().trim().min(3, 'deviceId là bắt buộc.'),
  token: z.string().trim().optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(10, 'Refresh token là bắt buộc.'),
  deviceId: z.string().trim().min(3, 'deviceId là bắt buộc.'),
});

export function createLicenseRouter(): Router {
  const router = Router();

  /**
   * POST /api/license/download-trial
   * For authenticated web users to download tool and receive a 3-day trial license.
   */
  router.post('/api/license/download-trial', async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.status(401).json({ status: 'error', message: 'Yêu cầu đăng nhập.' });
      return;
    }

    // Check if user is pending team member
    const member = await findTeamMember(authUser.id);
    if (member && member.status === 'pending') {
      res.status(403).json({
        status: 'error',
        code: 'PENDING_MEMBER',
        message: 'Tài khoản đang chờ duyệt (pending) không thể tải hoặc kích hoạt công cụ.',
      });
      return;
    }

    // 1. Ensure user has trial entitlement (3 days) if not already entitled
    const ent = await ensureTrialEntitlement(authUser.id);

    // 2. Check for existing active license key or generate new one
    const existing = await findLicenseKeysByUserId(authUser.id);
    const activeKey = existing.find((k) => k.status === 'active');

    let rawKey: string | null = null;
    let licenseKeyId = activeKey?.id;

    if (!activeKey) {
      rawKey = generateRawLicenseKey();
      const created = await createLicenseKey({
        userId: authUser.id,
        keyHash: hashLicenseKey(rawKey),
        maxDevices: 1,
      });
      licenseKeyId = created.id;
    }

    res.json({
      status: 'success',
      data: {
        licenseKeyId,
        licenseKey: rawKey, // Only returned at generation time!
        hasExistingKey: !!activeKey,
        plan: ent.plan,
        features: ent.features,
        expiresAt: ent.expiresAt,
        downloadUrl: '/downloads/HouseAndLife-Agent-Setup.exe',
        securityNotice:
          'Cảnh báo: Tự động đăng nhập Facebook/Zalo cá nhân có rủi ro checkpoint/khoá tài khoản. Nên sử dụng tài khoản chuyên dụng.',
      },
    });
  });

  /**
   * POST /api/license/activate
   * Device activation endpoint with hardware deviceId
   */
  router.post('/api/license/activate', validateSchema(activateSchema), async (req: Request, res: Response) => {
    const { key, deviceId, deviceName } = req.body;
    const result = await activateLicense({ rawKey: key, deviceId, deviceName });

    if (!result.success) {
      const statusCode =
        result.code === 'PENDING_MEMBER' || result.code === 'MAX_DEVICES_EXCEEDED'
          ? 403
          : result.code === 'ENTITLEMENT_EXPIRED'
          ? 402
          : result.code === 'INVALID_KEY'
          ? 400
          : 403;

      res.status(statusCode).json({
        status: 'error',
        code: result.code,
        message: result.message,
      });
      return;
    }

    res.json({
      status: 'success',
      message: 'Kích hoạt bản quyền thiết bị thành công.',
      data: result.data,
    });
  });

  /**
   * POST /api/license/heartbeat
   * Periodic ping from desktop agent
   */
  router.post('/api/license/heartbeat', validateSchema(heartbeatSchema), async (req: Request, res: Response) => {
    const token =
      req.body.token ||
      req.headers.authorization?.replace(/^Bearer\s+/i, '');

    const deviceId =
      (req.headers['x-device-id'] as string) || req.body.deviceId;

    if (!token) {
      res.status(401).json({ status: 'error', message: 'Thiếu device token.' });
      return;
    }

    const result = await processHeartbeat({ token, deviceId });
    if (!result.valid) {
      res.status(403).json({
        status: 'error',
        code: result.code,
        message: result.message,
      });
      return;
    }

    res.json({
      status: 'success',
      valid: true,
      expiresAt: result.expiresAt,
      offlineGraceHours: 48,
    });
  });

  /**
   * POST /api/license/refresh-token
   * Exchange long-lived device refresh token for short-lived access token
   */
  router.post('/api/license/refresh-token', validateSchema(refreshTokenSchema), async (req: Request, res: Response) => {
    const { refreshToken, deviceId } = req.body;
    const result = await refreshDeviceAccessToken({ refreshToken, deviceId });

    if (!result.success) {
      res.status(403).json({
        status: 'error',
        code: result.code,
        message: result.message,
      });
      return;
    }

    res.json({
      status: 'success',
      data: {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
    });
  });

  /**
   * GET /api/admin/licenses
   * Super Admin views all licenses and their active devices
   */
  router.get('/api/admin/licenses', requirePermission('license.manage'), async (_req: Request, res: Response) => {
    const keys = await listAllLicenseKeys();
    const result: any[] = [];
    for (const k of keys) {
      const devices = await getDevicesForLicense(k.id);
      result.push({
        id: k.id,
        userId: k.userId,
        status: k.status,
        maxDevices: k.maxDevices,
        deviceCount: devices.length,
        devices: devices.map((d) => ({
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          activatedAt: d.activatedAt,
          lastHeartbeatAt: d.lastHeartbeatAt,
        })),
        createdAt: k.createdAt,
        revokedAt: k.revokedAt,
      });
    }

    res.json({
      status: 'success',
      data: result,
    });
  });

  /**
   * POST /api/admin/licenses/:id/revoke
   * Super Admin revokes a license key immediately
   */
  router.post('/api/admin/licenses/:id/revoke', requirePermission('license.manage'), async (req: Request, res: Response) => {
    const success = await revokeLicenseKey(req.params.id);
    if (!success) {
      res.status(404).json({ status: 'error', message: 'Không tìm thấy license key.' });
      return;
    }

    res.json({
      status: 'success',
      message: 'Đã thu hồi giấy phép bản quyền thành công.',
    });
  });

  return router;
}
