import { sendError } from '../../utils/httpResponses';
import { Router, type Request, type Response } from 'express';
import { readDatabase, upsertUser, upsertCmsRecord } from '../../dbHelper';
import type { AuthUser, Property, User } from '../../../src/types';
import { slugifyAgentProfile, type AgentTier } from '../../../src/utils/agentTier';
import { clearCacheKey } from '../../cache/publicCache';
import { getAuthUser, scopeCollection, toPublicUser, toSafeUser } from '../auth/authAccess';
import { isSuperAdminUser } from '../auth/tenantScope';
import { hashPassword, validatePasswordPolicy } from '../auth/password';
import { applyPropertyHashtagSeo, syncSiteSeoKeywords } from '../public-site/seoKeywords';
import { validateSchema, createUserSchema, updateUserSchema } from '../../middleware/validation';
import { prisma } from '../../prisma';
import { getUserTransactions, listUserTopUpRequests } from '../wallet/walletService';
import { findLicenseKeysByUserId, getDevicesForLicense } from '../license/licenseRepository';
import { decryptLicenseKey } from '../license/licenseService';
import { findEntitlementsBySubject } from '../rbac/rbacRepository';

export function canManageUsers(req: Request, res: Response): boolean {
  const user = getAuthUser(req);
  if (!user) {
    sendError(res, 401, 'Yêu cầu đăng nhập.');
    return false;
  }
  // The permission engine already validated `user.manage` for this request.
  if (req._rbacPermissionChecked === 'user.manage') return true;
  if (user.role === 'owner' || (user.role as string) === 'super_admin' || user.role === 'company') return true;
  sendError(res, 403, 'Bạn không có quyền quản lý user.');
  return false;
}

export async function scopeUsers(users: User[], req: Request): Promise<User[]> {
  const user = getAuthUser(req);
  if (!user) return [];
  if (req.scope === 'all' || user.role === 'owner' || (user.role as string) === 'super_admin') return users;

  // Team scope: only the caller's team members (resolved by the server).
  if (req.scope === 'team' && req.teamId) {
    const { getTeamMembers } = await import('../rbac/rbacRepository');
    const members = await getTeamMembers(req.teamId);
    const ids = new Set(members.map((member) => member.userId));
    ids.add(user.id);
    return users.filter((item) => ids.has(item.id));
  }

  // Legacy company admin: own company only, never platform owners.
  if (user.role === 'company' && user.company_id) {
    return users.filter((item) => item.company_id === user.company_id && item.role !== 'owner');
  }

  return users.filter((item) => item.id === user.id);
}

export function countActiveOwners(users: User[]): number {
  return users.filter(item => item.role === 'owner' && item.status === 'active').length;
}

export async function assertCanUpdateUser(
  authUser: AuthUser,
  target: User,
  res: Response,
  req?: Request,
): Promise<boolean> {
  const isSelf = authUser.id === target.id;
  const isSuper = authUser.role === 'owner' || (authUser.role as string) === 'super_admin';

  if (isSuper) return true;

  if (authUser.role === 'company') {
    if (target.company_id !== authUser.company_id) {
      sendError(res, 403, 'Bạn không có quyền cập nhật user này.');
      return false;
    }
    if (!isSelf && target.role !== 'member') {
      sendError(res, 403, 'Company admin chỉ được cập nhật member trong company.');
      return false;
    }
    return true;
  }

  // Non-legacy roles must have passed the permission gate with a team scope and
  // may only touch members of their own team/company.
  if (req?._rbacPermissionChecked === 'user.manage' && req.scope === 'team') {
    if (target.role === 'owner') {
      sendError(res, 403, 'Bạn không có quyền cập nhật user này.');
      return false;
    }
    if (authUser.company_id && target.company_id && target.company_id !== authUser.company_id) {
      sendError(res, 403, 'Bạn không có quyền cập nhật user này.');
      return false;
    }
    if (req.teamId) {
      const { getTeamMember } = await import('../rbac/rbacRepository');
      const membership = await getTeamMember(target.id);
      if (!membership || membership.teamId !== req.teamId) {
        sendError(res, 403, 'Bạn không có quyền cập nhật user ngoài team của mình.');
        return false;
      }
    }
    return true;
  }

  sendError(res, 403, 'Bạn không có quyền cập nhật user.');
  return false;
}

type MemberPermissionCollection = 'customers' | 'properties' | 'posts';

export function createUsersRouter() {
  const router = Router();

router.get('/api/users', async (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;
  const db = readDatabase();
  const list = (await scopeUsers(db.users || [], req)).map(toSafeUser);
  res.json({ status: 'success', data: list });
});

/**
 * GET /api/users/:id/overview
 * Super admin inspects one account end to end: profile, plan, wallet
 * movements, top-up requests, license devices and published listings.
 */
router.get('/api/users/:id/overview', async (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;

  const authUser = getAuthUser(req);
  if (!authUser || !isSuperAdminUser(authUser)) {
    sendError(res, 403, 'Chỉ Super Admin mới có quyền xem đầy đủ thông tin người dùng.');
    return;
  }

  const userId = req.params.id;
  const db = readDatabase();
  const target = (db.users || []).find((item: User) => item.id === userId);
  if (!target) {
    sendError(res, 404, 'Không tìm thấy người dùng.');
    return;
  }

  const [walletRow, transactions, topUpRequests, licenseKeys, entitlements] = await Promise.all([
    prisma.userWallet.findUnique({ where: { userId } }),
    getUserTransactions(userId, 50),
    listUserTopUpRequests(userId, 50),
    findLicenseKeysByUserId(userId),
    findEntitlementsBySubject('user', userId),
  ]);

  const licenses = await Promise.all(
    licenseKeys.map(async (license) => ({
      id: license.id,
      key: license.status === 'active' ? decryptLicenseKey(license.keyCipher) : null,
      status: license.status,
      maxDevices: license.maxDevices,
      createdAt: license.createdAt,
      revokedAt: license.revokedAt,
      devices: (await getDevicesForLicense(license.id)).map((device) => ({
        deviceName: device.deviceName || 'Thiết bị không tên',
        deviceId: device.deviceId,
        activatedAt: device.activatedAt,
        lastHeartbeatAt: device.lastHeartbeatAt,
      })),
    })),
  );

  const now = Date.now();
  const activeEntitlement =
    entitlements.find(
      (entitlement) =>
        new Date(entitlement.startsAt).getTime() <= now && new Date(entitlement.expiresAt).getTime() > now,
    ) || null;

  // Mirror the public site: a profile is live when the account is active and
  // the user has not opted out; the slug may be derived instead of stored.
  const publicSlug = target.public_slug || `${slugifyAgentProfile(target.name)}-${target.id.slice(-4)}`;
  const publicProfile = {
    enabled: target.status === 'active' && target.show_public_profile !== false,
    slug: publicSlug,
    url: `/moi-gioi/${publicSlug}`,
    reason:
      target.status !== 'active'
        ? ('inactive' as const)
        : target.show_public_profile === false
          ? ('disabled' as const)
          : ('enabled' as const),
  };

  const properties = (db.properties || []).filter(
    (property: Property) =>
      property.created_by_user_id === userId || property.owner_user_id === userId,
  );
  const sortedProperties = properties
    .slice()
    .sort((a: Property, b: Property) =>
      String(b.created_at || '').localeCompare(String(a.created_at || '')),
    );

  res.json({
    status: 'success',
    data: {
      user: toSafeUser(target),
      publicProfile,
      wallet: walletRow
        ? {
            id: walletRow.id,
            balance: Number(walletRow.balance),
            lockedBalance: Number(walletRow.lockedBalance),
            availableBalance: Number(walletRow.balance) - Number(walletRow.lockedBalance),
            status: walletRow.status,
            updatedAt: walletRow.updatedAt,
          }
        : null,
      activeEntitlement,
      entitlements,
      licenseKeys: licenses,
      transactions,
      topUpRequests,
      properties: {
        total: properties.length,
        items: sortedProperties.slice(0, 50).map((property: Property) => ({
          id: property.id,
          title: property.title,
          type: property.type,
          transaction_type: property.transaction_type || 'Bán',
          location: property.location,
          price: Number(property.price || 0),
          sale_status: property.sale_status || 'available',
          created_at: property.created_at || '',
        })),
      },
    },
  });
});

router.post('/api/users', validateSchema(createUserSchema), async (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;

  const db = readDatabase();
  const authUser = getAuthUser(req);
  const isSuperAdmin = authUser.role === 'owner' || (authUser.role as string) === 'super_admin';
  if (!isSuperAdmin && authUser.role !== 'company') {
    sendError(res, 403, 'Chỉ quản trị viên công ty hoặc super admin mới được tạo user.');
    return;
  }
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const plainPassword = String(body.password || '').trim();

  if (!body.name || !email || !plainPassword) {
    sendError(res, 400, 'Tên, email và password là bắt buộc.');
    return;
  }

  const policy = validatePasswordPolicy(plainPassword, email);
  if (!policy.valid) {
    sendError(res, 400, policy.message || 'Mật khẩu không đạt yêu cầu bảo mật.');
    return;
  }

  if (db.users.some((user: User) => user.email.toLowerCase() === email)) {
    sendError(res, 409, 'Email đã tồn tại.');
    return;
  }

  const role = isSuperAdmin ? (body.role || 'member') : 'member';
  if (!['owner', 'company', 'member'].includes(role)) {
    sendError(res, 400, 'Role không hợp lệ.');
    return;
  }

  if (!isSuperAdmin && authUser.role === 'company' && role !== 'member') {
    sendError(res, 403, 'Company admin chỉ được tạo member.');
    return;
  }

  const company_id = isSuperAdmin
    ? (body.company_id || (role === 'owner' ? undefined : authUser.company_id))
    : authUser.company_id;

  const password_hash = await hashPassword(plainPassword);

  const newUser: User = {
    id: `u-${Date.now()}`,
    name: String(body.name).trim(),
    email,
    password_hash,
    role,
    company_id,
    status: body.status === 'inactive' ? 'inactive' : 'active',
    created_at: new Date().toISOString(),
    token_version: 1,
  };

  const savedUser = await upsertUser(newUser);
  res.json({ status: 'success', data: toSafeUser(savedUser) });
});

router.put('/api/users/:id', validateSchema(updateUserSchema), async (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;

  const db = readDatabase();
  const authUser = getAuthUser(req);
  const isSuperAdmin = authUser.role === 'owner' || (authUser.role as string) === 'super_admin';
  const index = db.users.findIndex((user: User) => user.id === req.params.id);

  if (index === -1) {
    sendError(res, 404, 'Không tìm thấy user.');
    return;
  }

  const target = db.users[index] as User;
  if (!(await assertCanUpdateUser(authUser, target, res, req))) return;

  const body = req.body || {};
  const isSelf = authUser.id === target.id;
  const nextName = body.name !== undefined ? String(body.name).trim() : target.name;
  const nextEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : target.email;

  if (!nextName || !nextEmail) {
    sendError(res, 400, 'Tên và email là bắt buộc.');
    return;
  }

  if (db.users.some((user: User) => user.id !== target.id && user.email.toLowerCase() === nextEmail)) {
    sendError(res, 409, 'Email đã tồn tại.');
    return;
  }

  let nextRole = target.role;
  if (isSuperAdmin && body.role !== undefined) {
    if (!['owner', 'company', 'member'].includes(body.role)) {
      sendError(res, 400, 'Role không hợp lệ.');
      return;
    }
    nextRole = body.role;
  }

  let nextCompanyId = target.company_id;
  if (isSuperAdmin && body.company_id !== undefined) {
    nextCompanyId = body.company_id ? String(body.company_id).trim() : undefined;
  }
  if (nextRole === 'owner') {
    nextCompanyId = undefined;
  }

  let nextStatus = target.status;
  if (body.status === 'inactive' || body.status === 'active') {
    if (isSelf && body.status === 'inactive') {
      sendError(res, 400, 'Bạn không thể tự vô hiệu hóa tài khoản của mình.');
      return;
    }
    if (isSuperAdmin || (authUser.role === 'company' && target.role === 'member')) {
      nextStatus = body.status;
    }
  }

  if (target.role === 'owner' && nextRole !== 'owner' && countActiveOwners(db.users) <= 1) {
    sendError(res, 400, 'Không thể hạ quyền owner cuối cùng.');
    return;
  }

  if (target.role === 'owner' && nextStatus === 'inactive' && countActiveOwners(db.users) <= 1) {
    sendError(res, 400, 'Không thể vô hiệu hóa owner cuối cùng.');
    return;
  }

  let nextAgentTier = target.agent_tier || 'normal';
  if (isSuperAdmin && body.agent_tier !== undefined) {
    const tier = String(body.agent_tier) as AgentTier;
    if (!['legendary', 'diamond', 'gold', 'silver', 'bronze', 'normal'].includes(tier)) {
      sendError(res, 400, 'Bậc agent không hợp lệ.');
      return;
    }
    if (tier === 'legendary' && nextRole !== 'owner') {
      sendError(res, 400, 'Bậc Administrator chỉ dành cho chủ sở hữu.');
      return;
    }
    nextAgentTier = tier;
  }
  if (nextRole === 'owner') {
    nextAgentTier = 'legendary';
  } else if (nextAgentTier === 'legendary') {
    nextAgentTier = 'normal';
  }

  let nextPasswordHash = target.password_hash;
  const passwordChanged = Boolean(body.password);
  if (passwordChanged) {
    const plainPass = String(body.password).trim();
    const policy = validatePasswordPolicy(plainPass, nextEmail);
    if (!policy.valid) {
      sendError(res, 400, policy.message || 'Mật khẩu không đạt yêu cầu bảo mật.');
      return;
    }
    nextPasswordHash = await hashPassword(plainPass);
  }

  const roleChanged = nextRole !== target.role;
  const statusChanged = nextStatus !== target.status;
  const shouldBumpToken = passwordChanged || roleChanged || statusChanged;
  const nextTokenVersion = shouldBumpToken ? (target.token_version ?? 1) + 1 : (target.token_version ?? 1);

  const updatedTarget: User = {
    ...target,
    name: nextName,
    email: nextEmail,
    password_hash: nextPasswordHash,
    role: nextRole,
    company_id: nextCompanyId,
    status: nextStatus,
    agent_tier: nextAgentTier,
    token_version: nextTokenVersion,
  };
  delete updatedTarget.password;

  const savedUser = await upsertUser(updatedTarget, target.version);
  res.json({ status: 'success', data: toSafeUser(savedUser) });
});

type MemberPermissionCollection = 'customers' | 'properties' | 'posts';

router.post('/api/member-permissions/bulk', async (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;

  const memberId = String(req.body?.member_id || '').trim();
  const collection = String(req.body?.collection || '') as MemberPermissionCollection;
  const assign = req.body?.assign !== false;
  const resourceIds = Array.isArray(req.body?.resource_ids)
    ? req.body.resource_ids.map((id: unknown) => String(id))
    : null;

  if (!memberId || !['customers', 'properties', 'posts'].includes(collection)) {
    sendError(res, 400, 'Thiếu member_id hoặc collection không hợp lệ.');
    return;
  }

  const authUser = getAuthUser(req);
  const isSuperAdmin = authUser.role === 'owner' || (authUser.role as string) === 'super_admin';
  if (!isSuperAdmin && authUser.role !== 'company') {
    sendError(res, 403, 'Chỉ quản trị viên công ty hoặc super admin mới được phân quyền hàng loạt.');
    return;
  }
  const db = readDatabase();
  const items = db[collection] as Array<{ id: string; company_id?: string; assigned_member_ids?: string[] }>;

  const targets = items.filter(item => {
    if (resourceIds && !resourceIds.includes(item.id)) return false;
    if (!isSuperAdmin && item.company_id !== authUser.company_id) return false;
    const assigned = (item.assigned_member_ids || []).includes(memberId);
    return assign ? !assigned : assigned;
  });

  let updated = 0;
  for (const item of targets) {
    const index = items.findIndex(row => row.id === item.id);
    if (index < 0) continue;

    const assignedIds = item.assigned_member_ids || [];
    const nextAssignedIds = assign
      ? [...new Set([...assignedIds, memberId])]
      : assignedIds.filter(id => id !== memberId);

    const companyId = items[index].company_id || authUser.company_id;
    const nextItem = {
      ...items[index],
      assigned_member_ids: nextAssignedIds,
      ...(companyId ? { company_id: companyId } : {}),
    };

    if (collection === 'properties') {
      const saved = applyPropertyHashtagSeo(nextItem as Property);
      await upsertCmsRecord('properties', saved, (items[index] as any).version);
    } else {
      await upsertCmsRecord(collection, nextItem, (items[index] as any).version);
    }
    updated += 1;
  }

  if (updated > 0) {
    if (collection === 'properties') {
      syncSiteSeoKeywords(db);
      clearCacheKey('public-properties');
      clearCacheKey('public-homepage');
    }
  }

  res.json({
    status: 'success',
    data: {
      updated,
      collection,
      member_id: memberId,
      assign,
      items: scopeCollection(db[collection], req),
    },
  });
});

  return router;
}
