import { Router, type Request, type Response } from 'express';
import { requirePermission } from './rbacMiddleware';
import {
  getAllRolePermissions,
  upsertRolePermission,
  listAllEntitlements,
  createEntitlement,
  deleteEntitlement,
} from './rbacRepository';
import { DEFAULT_ROLE_PERMISSIONS_MATRIX, type RoleKey, type PermissionKey, type PermissionScope } from './rbacTypes';
import { getAuthUser } from '../auth/authAccess';

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

  // 5. Delete / revoke an entitlement
  router.delete('/api/entitlements/:id', requirePermission('entitlement'), async (req: Request, res: Response) => {
    const id = req.params.id;
    const ok = await deleteEntitlement(id);
    if (!ok) {
      res.status(404).json({ status: 'error', message: 'Không tìm thấy gói hoặc thu hồi thất bại.' });
      return;
    }
    res.json({ status: 'success', message: 'Thu hồi gói tính năng thành công.' });
  });

  return router;
}
