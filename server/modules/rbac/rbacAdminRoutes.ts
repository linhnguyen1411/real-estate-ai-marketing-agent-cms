import { sendError } from '../../utils/httpResponses';
import { Router, type Request, type Response } from 'express';
import { requirePermission } from './rbacMiddleware';
import {
  getAllRolePermissions,
  upsertRolePermission,
  listAllEntitlements,
  createEntitlement,
  replaceActiveEntitlement,
  deleteEntitlement,
} from './rbacRepository';
import { DEFAULT_ROLE_PERMISSIONS_MATRIX, type RoleKey, type PermissionKey, type PermissionScope } from './rbacTypes';
import { getAuthUser } from '../auth/authAccess';
import { prisma } from '../../prisma';
import { ensureUserLicenseKey } from '../license/licenseService';
import {
  LICENSE_PLAN_FEATURES,
  LICENSE_PLAN_MAX_DEVICES,
  type PurchasablePlan,
} from '../license/planCatalog';

export function createRbacAdminRouter() {
  const router = Router();

  // 1. Get role permissions matrix
  router.get('/api/rbac/matrix', requirePermission('rbac.matrix'), async (_req: Request, res: Response) => {
    const rules = await getAllRolePermissions();
    res.json({
      status: 'success',
      data: rules.length > 0 ? rules : DEFAULT_ROLE_PERMISSIONS_MATRIX,
    });
  });

  // 2. Update role permissions matrix rule
  router.put('/api/rbac/matrix', requirePermission('rbac.matrix'), async (req: Request, res: Response) => {
    const { roleKey, permissionKey, scope, premiumOnly } = req.body || {};
    if (!roleKey || !permissionKey || !scope) {
      res.status(400).json({
        status: 'error',
        message: 'Thiếu thông tin roleKey, permissionKey hoặc scope.',
      });
      return;
    }

    await upsertRolePermission(
      roleKey as RoleKey,
      permissionKey as PermissionKey,
      scope as PermissionScope,
      Boolean(premiumOnly)
    );

    res.json({
      status: 'success',
      message: 'Cập nhật phân quyền ma trận thành công.',
    });
  });

  // 3. List all entitlements
  router.get('/api/entitlements', requirePermission('entitlement'), async (_req: Request, res: Response) => {
    const entitlements = await listAllEntitlements();
    res.json({
      status: 'success',
      data: entitlements,
    });
  });

  // 4. Create / grant an entitlement
  router.post('/api/entitlements', requirePermission('entitlement'), async (req: Request, res: Response) => {
    const { subjectType, subjectId, plan, features, startsAt, expiresAt } = req.body || {};
    if (!subjectType || !subjectId || !plan || !Array.isArray(features) || !expiresAt) {
      res.status(400).json({
        status: 'error',
        message: 'Dữ liệu gói dịch vụ không đầy đủ (subjectType, subjectId, plan, features, expiresAt).',
      });
      return;
    }

    const authUser = getAuthUser(req);
    const created = await createEntitlement({
      subjectType: subjectType === 'team' ? 'team' : 'user',
      subjectId: String(subjectId),
      plan: String(plan),
      features: features.map(String),
      startsAt: startsAt ? new Date(startsAt) : new Date(),
      expiresAt: new Date(expiresAt),
      source: 'super_admin',
      grantedBy: authUser.id,
    });

    res.json({
      status: 'success',
      message: 'Cấp gói tính năng thành công.',
      data: created,
    });
  });

  // 4b. Grant a paid plan directly to a user (no token deduction)
  router.post('/api/entitlements/grant-plan', requirePermission('entitlement'), async (req: Request, res: Response) => {
    const { subjectId, plan, expiresAt } = req.body || {};
    const planKey = String(plan || '') as PurchasablePlan;

    if (!subjectId || !Object.prototype.hasOwnProperty.call(LICENSE_PLAN_FEATURES, planKey)) {
      sendError(res, 400, 'Gói dịch vụ không hợp lệ.');
      return;
    }

    const expires = new Date(String(expiresAt || ''));
    if (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
      sendError(res, 400, 'Ngày kết thúc gói phải ở tương lai.');
      return;
    }

    const target = await prisma.user.findUnique({ where: { id: String(subjectId) } });
    if (!target) {
      sendError(res, 404, 'Không tìm thấy user cần cấp gói.');
      return;
    }

    let licenseKeyCreated = false;
    try {
      const ensured = await ensureUserLicenseKey({
        userId: target.id,
        maxDevices: LICENSE_PLAN_MAX_DEVICES[planKey],
      });
      licenseKeyCreated = ensured.created;
    } catch (error: any) {
      if (error?.code === 'KEY_REVOKED') {
        sendError(res, 409, 'License Key của user đã bị thu hồi, không thể cấp gói.');
        return;
      }
      console.error('[ENTITLEMENT] Không thể tạo License Key:', error);
      sendError(res, 500, 'Không thể tạo License Key cho user.');
      return;
    }

    const authUser = getAuthUser(req);
    const created = await replaceActiveEntitlement({
      subjectType: 'user',
      subjectId: target.id,
      plan: planKey,
      features: LICENSE_PLAN_FEATURES[planKey],
      startsAt: new Date(),
      expiresAt: expires,
      source: 'super_admin',
      grantedBy: authUser?.id || null,
    });

    res.json({
      status: 'success',
      message: 'Cấp gói dịch vụ thành công.',
      data: { entitlement: created, licenseKeyCreated },
    });
  });

  // 5. Delete / revoke an entitlement
  router.delete('/api/entitlements/:id', requirePermission('entitlement'), async (req: Request, res: Response) => {
    const id = req.params.id;
    const ok = await deleteEntitlement(id);
    if (!ok) {
      sendError(res, 404, 'Không tìm thấy gói hoặc thu hồi thất bại.');
      return;
    }
    res.json({ status: 'success', message: 'Thu hồi gói tính năng thành công.' });
  });

  return router;
}
