import { sendError } from '../../utils/httpResponses';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getAuthUser } from '../auth/authAccess';
import { findTeamMember } from '../rbac/rbacRepository';
import { requirePermission } from '../rbac/rbacMiddleware';
import { validateSchema } from '../../middleware/validation';
import { prisma } from '../../prisma';
import {
  ensureTrialEntitlement,
  ensureUserLicenseKey,
  activateLicense,
  processHeartbeat,
  refreshDeviceAccessToken,
} from './licenseService';
import {
  findLicenseKeyById,
  findLicenseKeysByUserId,
  listAllLicenseKeys,
  revokeLicenseKey,
  getDevicesForLicense,
} from './licenseRepository';
import { resolvePermissions } from '../rbac/rbacService';
import { buildAgentCapabilities } from './agentCapabilities';
import {
  provisionDesktopIngestCredential,
  revokeDesktopIngestCredentials,
} from './agentProvisioning';

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
      sendError(res, 401, 'Yêu cầu đăng nhập.');
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

    const ent = await ensureTrialEntitlement(authUser.id);
    if (ent.alreadyUsed) {
      res.status(403).json({
        status: 'error',
        code: 'TRIAL_ALREADY_USED',
        message: 'Mỗi tài khoản chỉ được dùng thử Premium Trial một lần. Vui lòng nâng cấp gói để tiếp tục.',
        data: { plan: ent.plan, expiresAt: ent.expiresAt },
      });
      return;
    }

    let ensured;
    try {
      ensured = await ensureUserLicenseKey({ userId: authUser.id });
    } catch (error: any) {
      if (error?.code === 'KEY_REVOKED') {
        res.status(403).json({
          status: 'error',
          code: 'KEY_REVOKED',
          message: 'Khóa bản quyền của tài khoản đã bị thu hồi. Vui lòng liên hệ quản trị viên.',
        });
        return;
      }
      throw error;
    }

    res.json({
      status: 'success',
      data: {
        licenseKeyId: ensured.key.id,
        licenseKey: ensured.rawKey,
        hasExistingKey: !ensured.created,
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
   * GET /api/license/my-license (and /api/license/my-key)
   * Fetch current authenticated user's license key and active devices
   */
  const handleGetMyLicense = async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    if (!authUser) {
      sendError(res, 401, 'Yêu cầu đăng nhập.');
      return;
    }

    const { checkToolEntitlement } = await import('./licenseService');
    const entitlement = await checkToolEntitlement(authUser.id);
    const existing = await findLicenseKeysByUserId(authUser.id);
    const activeKey = existing.find((k) => k.status === 'active') || existing[0];

    if (!activeKey) {
      res.json({
        status: 'success',
        data: {
          hasKey: false,
          plan: entitlement.plan,
          features: entitlement.features,
          expiresAt: entitlement.expiresAt,
        },
      });
      return;
    }

    if (activeKey.status === 'revoked') {
      res.status(403).json({
        status: 'error',
        code: 'KEY_REVOKED',
        message: 'Khóa bản quyền của tài khoản đã bị thu hồi. Vui lòng liên hệ quản trị viên.',
      });
      return;
    }

    // Legacy rows were stored hash-only; rotate them in place so the owner can
    // always re-open the single key tied to this account.
    const ensured = await ensureUserLicenseKey({ userId: authUser.id });
    const rawKey = ensured.rawKey;
    const devices = await getDevicesForLicense(ensured.key.id);

    res.json({
      status: 'success',
      data: {
        hasKey: true,
        licenseKeyId: ensured.key.id,
        licenseKey: rawKey,
        status: ensured.key.status,
        plan: entitlement.plan,
        features: entitlement.features,
        expiresAt: entitlement.expiresAt,
        maxDevices: ensured.key.maxDevices,
        activeDevices: devices.length,
        devices: devices.map((d) => ({
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          lastHeartbeatAt: d.lastHeartbeatAt,
        })),
        downloadUrl: '/downloads/HouseAndLife-Agent-Setup.exe',
      },
    });
  };

  router.get('/api/license/my-license', handleGetMyLicense);
  router.get('/api/license/my-key', handleGetMyLicense);

  /**
   * POST /api/license/request-pem
   * Issue or regenerate the account's single raw license key.
   */
  router.post('/api/license/request-pem', async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    if (!authUser) {
      sendError(res, 401, 'Yêu cầu đăng nhập.');
      return;
    }

    const member = await findTeamMember(authUser.id);
    if (member && member.status === 'pending') {
      res.status(403).json({
        status: 'error',
        code: 'PENDING_MEMBER',
        message: 'Tài khoản đang chờ duyệt không thể cấp khóa bản quyền.',
      });
      return;
    }

    const ent = await ensureTrialEntitlement(authUser.id);
    const hadKey = (await findLicenseKeysByUserId(authUser.id)).length > 0;

    let ensured;
    try {
      ensured = await ensureUserLicenseKey({ userId: authUser.id });
    } catch (error: any) {
      if (error?.code === 'KEY_REVOKED') {
        res.status(403).json({
          status: 'error',
          code: 'KEY_REVOKED',
          message: 'Khóa bản quyền của tài khoản đã bị thu hồi. Vui lòng liên hệ quản trị viên.',
        });
        return;
      }
      throw error;
    }

    const rawKey = ensured.rawKey;
    const expired = ent.alreadyUsed === true;
    res.json({
      status: 'success',
      message: expired
        ? 'Premium Trial của bạn đã hết hạn. Đây là key duy nhất của tài khoản; hãy nâng cấp gói để tiếp tục sử dụng.'
        : hadKey
          ? 'Đây là key duy nhất của tài khoản bạn. Mỗi tài khoản chỉ được cấp một lần.'
          : 'Đã tạo Khóa Bản Quyền Free thành công!',
      data: {
        licenseKeyId: ensured.key.id,
        licenseKey: rawKey,
        plan: ent.plan,
        features: ent.features,
        expiresAt: ent.expiresAt,
        maxDevices: ensured.key.maxDevices,
        expired,
        hasExistingKey: hadKey,
        downloadUrl: '/downloads/HouseAndLife-Agent-Setup.exe',
        securityNotice:
          'Khóa bản quyền dùng để kích hoạt Desktop Agent thu thập & phân tích tin BĐS tự động.',
      },
    });
  });

  /**
   * POST /api/license/upgrade-plan
   * Admin-only activation of a paid plan (bank transfer confirmed manually).
   * Reuses the account's single existing license key — never issues a second.
   */
  const upgradePlanSchema = z.object({
    plan: z.enum(['pro', 'enterprise']),
    periodDays: z.number().int().min(1).max(365).optional(),
    userId: z.string().trim().min(1).optional(),
  });

  router.post(
    '/api/license/upgrade-plan',
    requirePermission('license.manage'),
    validateSchema(upgradePlanSchema),
    async (req: Request, res: Response) => {
      const authUser = getAuthUser(req);
      if (!authUser) {
        sendError(res, 401, 'Yêu cầu đăng nhập.');
        return;
      }

      const { plan, periodDays = 30 } = req.body;
      const targetUserId = req.body.userId || authUser.id;
      const maxDevices = plan === 'enterprise' ? 10 : 3;
      const expiresAt = new Date(Date.now() + Number(periodDays) * 86400_000);

      const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true },
      });
      if (!target) {
        sendError(res, 404, 'Không tìm thấy tài khoản cần nâng cấp.');
        return;
      }

      const features =
        plan === 'enterprise'
          ? ['tool.exe', 'agent.*', 'lead.intel', 'crm', 'investor_leads', 'fb_inbox', 'automation.*', 'team.manage']
          : ['tool.exe', 'agent.sources', 'agent.runtime', 'agent.reports', 'agent.notifications', 'lead.intel', 'crm', 'investor_leads'];

      const { createEntitlement } = await import('../rbac/rbacRepository');
      const created = await createEntitlement({
        subjectType: 'user',
        subjectId: target.id,
        plan,
        features,
        startsAt: new Date(),
        expiresAt,
        source: 'super_admin',
        grantedBy: authUser.id,
      });

      let ensured;
      try {
        ensured = await ensureUserLicenseKey({ userId: target.id, maxDevices });
      } catch (error: any) {
        if (error?.code === 'KEY_REVOKED') {
          res.status(409).json({
            status: 'error',
            code: 'KEY_REVOKED',
            message:
              'Đã cấp gói nhưng khóa bản quyền của tài khoản đã bị thu hồi. Hãy xử lý khóa trước khi phát hành lại.',
            data: { plan: created.plan, expiresAt: created.expiresAt },
          });
          return;
        }
        throw error;
      }

      res.json({
        status: 'success',
        message: `Đã kích hoạt gói ${plan.toUpperCase()} cho ${target.email}.`,
        data: {
          userId: target.id,
          plan: created.plan,
          expiresAt: created.expiresAt,
          features: created.features,
          licenseKey: ensured.rawKey,
          maxDevices: ensured.key.maxDevices,
          hasExistingKey: !ensured.created,
        },
      });
    },
  );

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
      sendError(res, 401, 'Thiếu device token.');
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

    const userRow = result.userId
      ? await prisma.user.findUnique({
          where: { id: result.userId },
          select: { id: true, email: true, role: true, companyId: true, data: true },
        })
      : null;
    if (!userRow) {
      sendError(res, 403, 'Không tìm thấy tài khoản sở hữu khóa bản quyền.');
      return;
    }

    const userData = (userRow.data as Record<string, unknown>) || {};
    const resolved = await resolvePermissions({
      id: userRow.id,
      role: userRow.role,
      email: userRow.email,
      company_id: userRow.companyId || undefined,
    });
    const capabilities = buildAgentCapabilities(resolved, result.features || []);
    if (!capabilities.canScan) {
      res.status(403).json({
        status: 'error',
        code: 'AGENT_NOT_ALLOWED',
        message: 'Tài khoản không còn quyền sử dụng Desktop Agent.',
      });
      return;
    }

    const ingest = await provisionDesktopIngestCredential({
      userId: userRow.id,
      deviceId,
      companyId: userRow.companyId || null,
      capabilities,
      expiresAt: result.expiresAt ?? null,
    });

    res.json({
      status: 'success',
      valid: true,
      expiresAt: result.expiresAt,
      offlineGraceHours: 48,
      data: {
        user: {
          id: userRow.id,
          name: String(userData.name || userData.full_name || userRow.email || ''),
          email: userRow.email,
          role: userRow.role,
          roleKey: capabilities.roleKey,
          roleLabel: capabilities.roleLabel,
          companyId: userRow.companyId || null,
          teamId: resolved.teamId || null,
          portal: capabilities.portal,
        },
        capabilities,
        plan: result.plan,
        features: result.features || [],
        ingest,
        ingestExpiresAt: ingest.expiresAt,
      },
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
    const existing = await findLicenseKeyById(req.params.id);
    const success = await revokeLicenseKey(req.params.id);
    if (!success) {
      sendError(res, 404, 'Không tìm thấy license key.');
      return;
    }

    // Device tokens die with the key, but HMAC ingest credentials are separate
    // rows — revoke them too or a cached agent could keep writing data.
    if (existing?.userId) {
      await revokeDesktopIngestCredentials(existing.userId);
    }

    res.json({
      status: 'success',
      message: 'Đã thu hồi giấy phép bản quyền thành công.',
    });
  });

  return router;
}
