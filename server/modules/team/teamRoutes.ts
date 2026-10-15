import { Router, type Request, type Response } from 'express';
import { requirePermission } from '../rbac/rbacMiddleware';
import {
  getTeamMembers,
  updateTeamMemberStatus,
  rotateTeamReferralCode,
  getTeamPermissionOverrides,
  upsertTeamPermissionOverride,
  getAllRolePermissions,
} from '../rbac/rbacRepository';
import { narrowScope, DEFAULT_ROLE_PERMISSIONS_MATRIX, type PermissionScope } from '../rbac/rbacTypes';
import { getAuthUser } from '../auth/authAccess';
import { readDatabase } from '../../dbHelper';

export function createTeamRouter() {
  const router = Router();

  // 1. List team members for the lead's team
  router.get('/api/team/members', requirePermission('team.members.manage'), async (req: Request, res: Response) => {
    const teamId = req.teamId;
    if (!teamId) {
      res.status(404).json({ status: 'error', message: 'Bạn không thuộc team nào.' });
      return;
    }

    const members = await getTeamMembers(teamId);
    const db = readDatabase();
    const userMap = new Map((db.users || []).map((u: any) => [u.id, u]));

    const enriched = members.map((m) => {
      const user = userMap.get(m.userId) as any;
      return {
        userId: m.userId,
        name: user?.name || 'Thành viên',
        email: user?.email || '',
        phone: user?.phone || '',
        avatarUrl: user?.avatar_url || '',
        status: m.status,
        joinedAt: m.joinedAt,
        approvedBy: m.approvedBy,
      };
    });

    res.json({ status: 'success', data: enriched });
  });

  // 2. Approve or suspend a team member
  router.patch('/api/team/members/:userId', requirePermission('team.members.manage'), async (req: Request, res: Response) => {
    const teamId = req.teamId;
    if (!teamId) {
      res.status(404).json({ status: 'error', message: 'Bạn không thuộc team nào.' });
      return;
    }

    const targetUserId = req.params.userId;
    const { status } = req.body || {};

    if (status !== 'approved' && status !== 'suspended') {
      res.status(400).json({
        status: 'error',
        message: 'Trạng thái không hợp lệ. Chỉ chấp nhận "approved" hoặc "suspended".',
      });
      return;
    }

    const authUser = getAuthUser(req);
    const updated = await updateTeamMemberStatus(teamId, targetUserId, status, authUser.id);
    if (!updated) {
      res.status(404).json({
        status: 'error',
        message: 'Thành viên không thuộc team của bạn hoặc không tồn tại.',
      });
      return;
    }

    res.json({
      status: 'success',
      message: status === 'approved' ? 'Đã duyệt thành viên vào team.' : 'Đã tạm đình chỉ thành viên.',
      data: updated,
    });
  });

  // 3. Rotate team referral code
  router.post('/api/team/rotate-referral-code', requirePermission('team.members.manage'), async (req: Request, res: Response) => {
    const teamId = req.teamId;
    if (!teamId) {
      res.status(404).json({ status: 'error', message: 'Bạn không thuộc team nào.' });
      return;
    }

    const newCode = await rotateTeamReferralCode(teamId);
    res.json({
      status: 'success',
      message: 'Mã giới thiệu của team đã được làm mới thành công.',
      data: { referralCode: newCode },
    });
  });

  // 4. Get team permission overrides
  router.get('/api/team/permissions', requirePermission('team.permissions.edit'), async (req: Request, res: Response) => {
    const teamId = req.teamId;
    if (!teamId) {
      res.status(404).json({ status: 'error', message: 'Bạn không thuộc team nào.' });
      return;
    }

    const overrides = await getTeamPermissionOverrides(teamId);
    res.json({ status: 'success', data: overrides });
  });

  // 5. Update team permission overrides (strictly narrows, never widens)
  router.put('/api/team/permissions', requirePermission('team.permissions.edit'), async (req: Request, res: Response) => {
    const teamId = req.teamId;
    if (!teamId) {
      res.status(404).json({ status: 'error', message: 'Bạn không thuộc team nào.' });
      return;
    }

    const rawOverrides = (req.body?.overrides || {}) as Record<string, PermissionScope>;
    const allRules = await getAllRolePermissions();
    const rules = allRules.length > 0 ? allRules : DEFAULT_ROLE_PERMISSIONS_MATRIX;
    const memberBaseMap = new Map(
      rules.filter((r) => r.roleKey === 'member').map((r) => [r.permissionKey, r.scope])
    );

    const savedOverrides: Record<string, PermissionScope> = {};

    for (const [permKey, desiredScope] of Object.entries(rawOverrides)) {
      const baseScope = memberBaseMap.get(permKey as any) || 'none';
      // Server enforcement: override may only narrow and NEVER widen
      const effectiveScope = narrowScope(baseScope, desiredScope);
      await upsertTeamPermissionOverride(teamId, permKey, effectiveScope);
      savedOverrides[permKey] = effectiveScope;
    }

    res.json({
      status: 'success',
      message: 'Cập nhật phân quyền giới hạn cho team thành công.',
      data: savedOverrides,
    });
  });

  return router;
}
