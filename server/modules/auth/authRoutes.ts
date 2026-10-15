import { Router, type Request, type Response, type NextFunction } from 'express';
import { getUserById, readDatabase, upsertUser, writeDatabase } from '../../dbHelper';
import { saveImageFromDataUrl } from '../../blog/imageStorage';
import type { User } from '../../../src/types';
import { slugifyAgentProfile } from '../../../src/utils/agentTier';
import {
  assertUniquePublicSlug,
  getAuthUser,
  signToken,
  toAuthUser,
  toSafeUser,
  verifyToken,
} from './authAccess';

import {
  hashPassword,
  needsRehash,
  validatePasswordPolicy,
  verifyPassword,
  verifyPlaintextLegacy,
} from './password';

import { loginRateLimiter, registerRateLimiter, recordFailedLogin, clearLoginFailures } from '../../middleware/rateLimiters';
import { validateSchema, loginSchema, registerSchema, updateProfileSchema } from '../../middleware/validation';

export function createAuthLoginRouter() {
  const router = Router();

router.post('/api/auth/register', registerRateLimiter, validateSchema(registerSchema), async (req: Request, res: Response) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const referralCode = req.body?.referralCode ? String(req.body.referralCode).trim().toUpperCase() : undefined;

  // 1. Password policy
  const policyResult = validatePasswordPolicy(password);
  if (!policyResult.valid) {
    res.status(400).json({ status: 'error', message: policyResult.message });
    return;
  }

  const db = readDatabase();
  // 2. Uniqueness check
  const existing = (db.users || []).find((u: any) => u.email?.trim().toLowerCase() === email);
  if (existing) {
    res.status(400).json({ status: 'error', message: 'Email đã được sử dụng.' });
    return;
  }

  // 3. Referral code validation & Team binding
  let targetTeam: any = null;
  if (referralCode) {
    const { getTeamByReferralCode, createTeam } = await import('../rbac/rbacRepository');
    targetTeam = await getTeamByReferralCode(referralCode);
    if (!targetTeam) {
      // Check if user has this referral code to initialize their team
      const referrer = (db.users || []).find((u: any) => (u.referral_code || '').toUpperCase() === referralCode);
      if (referrer) {
        targetTeam = await createTeam({
          id: `team-${referrer.id}`,
          leadUserId: referrer.id,
          referralCode: referralCode,
          isPlatformRoot: referrer.role === 'owner',
          createdAt: new Date(),
        });
      }
    }

    if (!targetTeam) {
      res.status(400).json({ status: 'error', message: 'Mã giới thiệu không hợp lệ.' });
      return;
    }
  }

  // 4. Create user
  const { generateReferralCode } = await import('../rbac/rbacRepository');
  const userReferralCode = generateReferralCode();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  const newUser: User = {
    id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    email,
    password_hash: passwordHash,
    role: 'member',
    status: 'active',
    referral_code: userReferralCode,
    token_version: 1,
    created_at: now,
  };

  const savedUser = await upsertUser(newUser);

  // 5. Add to team if registered with code
  if (targetTeam) {
    const { createTeamMember } = await import('../rbac/rbacRepository');
    await createTeamMember({
      teamId: targetTeam.id,
      userId: savedUser.id,
      status: 'pending',
      approvedBy: null,
      joinedAt: new Date(),
    });
  }

  const authUser = toAuthUser(savedUser, db);
  const token = signToken(authUser);

  res.json({
    status: 'success',
    message: 'Đăng ký tài khoản thành công.',
    data: {
      token,
      user: toSafeUser(savedUser),
    },
  });
});

router.post('/api/auth/login', loginRateLimiter, validateSchema(loginSchema), async (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const plainPassword = String(req.body?.password || '');

  if (!email || !plainPassword) {
    res.status(401).json({ status: 'error', message: 'Email hoặc mật khẩu không đúng.' });
    return;
  }

  const db = readDatabase();
  const user = db.users?.find(
    item => item.email?.trim().toLowerCase() === email && item.status === 'active'
  );

  if (!user) {
    recordFailedLogin(email);
    res.status(401).json({ status: 'error', message: 'Email hoặc mật khẩu không đúng.' });
    return;
  }

  let isValid = false;

  if (user.password_hash) {
    isValid = await verifyPassword(plainPassword, user.password_hash);
    if (isValid && needsRehash(user.password_hash)) {
      // Automatic transparent upgrade from scrypt to argon2id
      const newHash = await hashPassword(plainPassword);
      user.password_hash = newHash;
      delete user.password;
      await upsertUser(user, user.version);
    }
  } else if (user.password) {
    isValid = verifyPlaintextLegacy(plainPassword, user.password);
    if (isValid) {
      // Automatic transparent upgrade: hash password (argon2id), write password_hash, delete plaintext password
      const newHash = await hashPassword(plainPassword);
      user.password_hash = newHash;
      delete user.password;
      await upsertUser(user, user.version);
    }
  }

  if (!isValid) {
    recordFailedLogin(email);
    res.status(401).json({ status: 'error', message: 'Email hoặc mật khẩu không đúng.' });
    return;
  }

  clearLoginFailures(email);

  const authUser = toAuthUser(user, db);
  res.json({ status: 'success', data: { token: signToken(authUser), user: authUser } });
});

  return router;
}

export function createApiAuthGate() {
  return (req: Request, res: Response, next: NextFunction) => {
  const pathName = String(req.path || '');
  const original = String(req.originalUrl || '');
  if (
    pathName === '/health' ||
    pathName === '/planning/health' ||
    pathName === '/auth/login' ||
    pathName === '/auth/register' ||
    pathName === '/api/auth/register' ||
    pathName === '/license/activate' ||
    pathName === '/api/license/activate' ||
    pathName === '/license/heartbeat' ||
    pathName === '/api/license/heartbeat' ||
    pathName === '/license/refresh-token' ||
    pathName === '/api/license/refresh-token' ||
    pathName.startsWith('/public/') ||
    pathName.startsWith('/agent-ingest/') ||
    // Execution Agent Runtime API authenticates via AGENT_RUNTIME_TOKEN (not CMS session).
    pathName.startsWith('/agent/runtime/') ||
    // Fallback allowlist if static middleware did not handle the file.
    (req.method === 'GET' &&
      (pathName.startsWith('/social/media/files/') ||
        pathName.startsWith('/api/social/media/files/') ||
        original.startsWith('/api/social/media/files/')))
  ) {
    return next();
  }

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const decoded = token ? verifyToken(token) : null;
    const user = decoded ? getUserById(decoded.sub) : null;

    if (!user || user.status !== 'active') {
      res.status(401).json({ status: 'error', message: 'Bạn cần đăng nhập để truy cập hệ thống.' });
      return;
    }

    // Token version revocation check: if user's token_version differs, token is invalidated
    const expectedVersion = user.token_version ?? 1;
    const tokenVersion = decoded?.token_version ?? 1;
    if (tokenVersion !== expectedVersion) {
      res.status(401).json({ status: 'error', message: 'Phiên đăng nhập đã hết hiệu lực do thay đổi mật khẩu hoặc bảo mật.' });
      return;
    }

    const db = readDatabase();
    (req as any).authUser = toAuthUser(user, db);

    // Enforce mandatory password change if user.must_change_password is true
    if (user.must_change_password) {
      const allowedPaths = ['/api/auth/me', '/auth/me', '/api/auth/profile', '/auth/profile', '/api/auth/change-password', '/auth/change-password'];
      const currentPath = pathName.startsWith('/api') ? pathName : `/api${pathName}`;
      if (!allowedPaths.includes(currentPath)) {
        res.status(403).json({
          status: 'error',
          code: 'MUST_CHANGE_PASSWORD',
          message: 'Bạn phải đổi mật khẩu trước khi tiếp tục sử dụng hệ thống.',
        });
        return;
      }
    }

    next();
  };
}

export function createAuthMeRouter() {
  const router = Router();

router.get('/api/auth/me', async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  try {
    const { resolvePermissions } = await import('../rbac');
    const resolved = await resolvePermissions(authUser as any);
    res.json({
      status: 'success',
      data: {
        ...authUser,
        roleKey: resolved.roleKey,
        teamId: resolved.teamId,
        isPlatformRootTeam: resolved.isPlatformRootTeam,
        isTeamLead: resolved.isTeamLead,
        permissions: resolved.permissions,
        entitlements: Array.from(resolved.activeEntitlementFeatures),
      },
    });
  } catch {
    res.json({ status: 'success', data: authUser });
  }
});

router.put('/api/auth/profile', validateSchema(updateProfileSchema), async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const db = readDatabase();
  const index = db.users.findIndex((user: User) => user.id === authUser.id);

  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy tài khoản.' });
    return;
  }

  const target = db.users[index] as User;
  const body = req.body || {};
  const nextName = body.name !== undefined ? String(body.name).trim() : target.name;
  const nextEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : target.email;
  const nextPhone = body.phone !== undefined ? String(body.phone).trim() : (target.phone || '');
  const nextBio = body.bio !== undefined ? String(body.bio).trim().slice(0, 600) : (target.bio || '');
  let nextAvatarUrl = body.avatar_url !== undefined ? String(body.avatar_url).trim() : target.avatar_url;
  const nextShowPublic = body.show_public_profile !== undefined
    ? body.show_public_profile !== false
    : target.show_public_profile !== false;

  if (body.image !== undefined) {
    const image = String(body.image || '').trim();
    if (image) {
      try {
        nextAvatarUrl = saveImageFromDataUrl(image, 'agent-avatars', authUser.id);
      } catch (error: any) {
        res.status(400).json({ status: 'error', message: error.message || 'Upload avatar thất bại.' });
        return;
      }
    }
  }

  let nextPublicSlug = target.public_slug;
  if (body.public_slug !== undefined) {
    nextPublicSlug = slugifyAgentProfile(String(body.public_slug || ''));
    if (!assertUniquePublicSlug(db, nextPublicSlug, target.id, res)) return;
  } else if (!nextPublicSlug) {
    nextPublicSlug = `${slugifyAgentProfile(nextName)}-${target.id.slice(-4)}`;
  }

  if (!nextName || !nextEmail) {
    res.status(400).json({ status: 'error', message: 'Tên và email là bắt buộc.' });
    return;
  }

  if (db.users.some((user: User) => user.id !== target.id && user.email.toLowerCase() === nextEmail)) {
    res.status(409).json({ status: 'error', message: 'Email đã được sử dụng.' });
    return;
  }

  let nextPasswordHash = target.password_hash;
  const newPassword = String(body.new_password || '').trim();
  if (newPassword) {
    const currentPassword = String(body.current_password || '');
    let isCurrentValid = false;
    if (target.password_hash) {
      isCurrentValid = await verifyPassword(currentPassword, target.password_hash);
    } else if (target.password) {
      isCurrentValid = verifyPlaintextLegacy(currentPassword, target.password);
    }

    if (!isCurrentValid) {
      res.status(400).json({ status: 'error', message: 'Mật khẩu hiện tại không đúng.' });
      return;
    }

    const policy = validatePasswordPolicy(newPassword, nextEmail);
    if (!policy.valid) {
      res.status(400).json({ status: 'error', message: policy.message || 'Mật khẩu không đạt yêu cầu bảo mật.' });
      return;
    }

    nextPasswordHash = await hashPassword(newPassword);
  }

  const nextTokenVersion = newPassword ? (target.token_version ?? 1) + 1 : (target.token_version ?? 1);

  const updatedUser: User = {
    ...target,
    name: nextName,
    email: nextEmail,
    phone: nextPhone || undefined,
    bio: nextBio || undefined,
    avatar_url: nextAvatarUrl || undefined,
    public_slug: nextPublicSlug,
    show_public_profile: nextShowPublic,
    password_hash: nextPasswordHash,
    must_change_password: newPassword ? false : Boolean(target.must_change_password),
    token_version: nextTokenVersion,
  };
  delete updatedUser.password;

  const savedUser = await upsertUser(updatedUser, target.version);
  res.json({ status: 'success', data: toAuthUser(savedUser, db) });
});

  return router;
}
