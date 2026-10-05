import { Router, type Request, type Response } from 'express';
import { readDatabase, upsertUser, upsertCmsRecord, writeDatabase } from '../../dbHelper';
import type { AuthUser, Property, User } from '../../../src/types';
import type { AgentTier } from '../../../src/utils/agentTier';
import { clearCacheKey } from '../../cache/publicCache';
import { getAuthUser, scopeCollection, toPublicUser } from '../auth/authAccess';
import { hashPassword, validatePasswordPolicy } from '../auth/password';
import { applyPropertyHashtagSeo, syncSiteSeoKeywords } from '../public-site/seoKeywords';
import { validateSchema, createUserSchema, updateUserSchema } from '../../middleware/validation';

export function canManageUsers(req: Request, res: Response): boolean {
  const user = getAuthUser(req);
  if (user.role === 'owner' || user.role === 'company') return true;
  res.status(403).json({ status: 'error', message: 'Bạn không có quyền quản lý user.' });
  return false;
}

export function scopeUsers(users: User[], req: Request): User[] {
  const user = getAuthUser(req);
  if (user.role === 'owner') return users;
  if (user.role === 'company') return users.filter(item => item.company_id === user.company_id && item.role !== 'owner');
  return [];
}

export function countActiveOwners(users: User[]): number {
  return users.filter(item => item.role === 'owner' && item.status === 'active').length;
}

export function assertCanUpdateUser(authUser: AuthUser, target: User, res: Response): boolean {
  const isSelf = authUser.id === target.id;

  if (authUser.role === 'owner') return true;

  if (authUser.role === 'company') {
    if (target.company_id !== authUser.company_id) {
      res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật user này.' });
      return false;
    }
    if (!isSelf && target.role !== 'member') {
      res.status(403).json({ status: 'error', message: 'Company admin chỉ được cập nhật member trong company.' });
      return false;
    }
    return true;
  }

  res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật user.' });
  return false;
}

type MemberPermissionCollection = 'customers' | 'properties' | 'posts';

export function createUsersRouter() {
  const router = Router();

router.get('/api/users', (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;
  const db = readDatabase();
  const list = scopeUsers(db.users || [], req).map(toPublicUser);
  res.json({ status: 'success', data: list });
});

router.post('/api/users', validateSchema(createUserSchema), async (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;

  const db = readDatabase();
  const authUser = getAuthUser(req);
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const plainPassword = String(body.password || '').trim();

  if (!body.name || !email || !plainPassword) {
    res.status(400).json({ status: 'error', message: 'Tên, email và password là bắt buộc.' });
    return;
  }

  const policy = validatePasswordPolicy(plainPassword, email);
  if (!policy.valid) {
    res.status(400).json({ status: 'error', message: policy.message || 'Mật khẩu không đạt yêu cầu bảo mật.' });
    return;
  }

  if (db.users.some((user: User) => user.email.toLowerCase() === email)) {
    res.status(409).json({ status: 'error', message: 'Email đã tồn tại.' });
    return;
  }

  const role = authUser.role === 'owner' ? (body.role || 'member') : 'member';
  if (!['owner', 'company', 'member'].includes(role)) {
    res.status(400).json({ status: 'error', message: 'Role không hợp lệ.' });
    return;
  }

  if (authUser.role === 'company' && role !== 'member') {
    res.status(403).json({ status: 'error', message: 'Company admin chỉ được tạo member.' });
    return;
  }

  const company_id = authUser.role === 'owner'
    ? (body.company_id || (role === 'owner' ? undefined : authUser.company_id || 'comp-da-nang'))
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
    created_at: new Date().toISOString()
  };

  const savedUser = await upsertUser(newUser);
  res.json({ status: 'success', data: toPublicUser(savedUser) });
});

router.put('/api/users/:id', validateSchema(updateUserSchema), async (req: Request, res: Response) => {
  if (!canManageUsers(req, res)) return;

  const db = readDatabase();
  const authUser = getAuthUser(req);
  const index = db.users.findIndex((user: User) => user.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy user.' });
    return;
  }

  const target = db.users[index] as User;
  if (!assertCanUpdateUser(authUser, target, res)) return;

  const body = req.body || {};
  const isSelf = authUser.id === target.id;
  const nextName = body.name !== undefined ? String(body.name).trim() : target.name;
  const nextEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : target.email;

  if (!nextName || !nextEmail) {
    res.status(400).json({ status: 'error', message: 'Tên và email là bắt buộc.' });
    return;
  }

  if (db.users.some((user: User) => user.id !== target.id && user.email.toLowerCase() === nextEmail)) {
    res.status(409).json({ status: 'error', message: 'Email đã tồn tại.' });
    return;
  }

  let nextRole = target.role;
  if (authUser.role === 'owner' && body.role !== undefined) {
    if (!['owner', 'company', 'member'].includes(body.role)) {
      res.status(400).json({ status: 'error', message: 'Role không hợp lệ.' });
      return;
    }
    nextRole = body.role;
  }

  let nextCompanyId = target.company_id;
  if (authUser.role === 'owner' && body.company_id !== undefined) {
    nextCompanyId = body.company_id ? String(body.company_id).trim() : undefined;
  }
  if (nextRole === 'owner') {
    nextCompanyId = undefined;
  }

  let nextStatus = target.status;
  if (body.status === 'inactive' || body.status === 'active') {
    if (isSelf && body.status === 'inactive') {
      res.status(400).json({ status: 'error', message: 'Bạn không thể tự vô hiệu hóa tài khoản của mình.' });
      return;
    }
    if (authUser.role === 'owner' || (authUser.role === 'company' && target.role === 'member')) {
      nextStatus = body.status;
    }
  }

  if (target.role === 'owner' && nextRole !== 'owner' && countActiveOwners(db.users) <= 1) {
    res.status(400).json({ status: 'error', message: 'Không thể hạ quyền owner cuối cùng.' });
    return;
  }

  if (target.role === 'owner' && nextStatus === 'inactive' && countActiveOwners(db.users) <= 1) {
    res.status(400).json({ status: 'error', message: 'Không thể vô hiệu hóa owner cuối cùng.' });
    return;
  }

  let nextAgentTier = target.agent_tier || 'normal';
  if (authUser.role === 'owner' && body.agent_tier !== undefined) {
    const tier = String(body.agent_tier) as AgentTier;
    if (!['legendary', 'diamond', 'gold', 'silver', 'bronze', 'normal'].includes(tier)) {
      res.status(400).json({ status: 'error', message: 'Bậc agent không hợp lệ.' });
      return;
    }
    if (tier === 'legendary' && nextRole !== 'owner') {
      res.status(400).json({ status: 'error', message: 'Bậc Administrator chỉ dành cho chủ sở hữu.' });
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
  if (body.password) {
    const plainPass = String(body.password).trim();
    const policy = validatePasswordPolicy(plainPass, nextEmail);
    if (!policy.valid) {
      res.status(400).json({ status: 'error', message: policy.message || 'Mật khẩu không đạt yêu cầu bảo mật.' });
      return;
    }
    nextPasswordHash = await hashPassword(plainPass);
  }

  const updatedTarget: User = {
    ...target,
    name: nextName,
    email: nextEmail,
    password_hash: nextPasswordHash,
    role: nextRole,
    company_id: nextCompanyId,
    status: nextStatus,
    agent_tier: nextAgentTier,
  };
  delete updatedTarget.password;

  const savedUser = await upsertUser(updatedTarget, target.version);
  res.json({ status: 'success', data: toPublicUser(savedUser) });
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
    res.status(400).json({ status: 'error', message: 'Thiếu member_id hoặc collection không hợp lệ.' });
    return;
  }

  const authUser = getAuthUser(req);
  const db = readDatabase();
  const items = db[collection] as Array<{ id: string; company_id?: string; assigned_member_ids?: string[] }>;

  const targets = items.filter(item => {
    if (resourceIds && !resourceIds.includes(item.id)) return false;
    if (authUser.role === 'company' && item.company_id && item.company_id !== authUser.company_id) return false;
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

    const companyId = items[index].company_id || authUser.company_id || 'comp-da-nang';
    const nextItem = {
      ...items[index],
      assigned_member_ids: nextAssignedIds,
      company_id: companyId,
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
