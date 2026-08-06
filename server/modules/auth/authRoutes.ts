import { Router, type Request, type Response, type NextFunction } from 'express';
import { readDatabase, writeDatabase } from '../../dbHelper';
import { saveImageFromDataUrl } from '../../blog/imageStorage';
import type { User } from '../../../src/types';
import { slugifyAgentProfile } from '../../../src/utils/agentTier';
import {
  assertUniquePublicSlug,
  getAuthUser,
  signToken,
  toAuthUser,
  verifyToken,
} from './authAccess';

export function createAuthLoginRouter() {
  const router = Router();

router.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  const db = readDatabase();
  const user = db.users?.find(item => item.email === email && item.password === password && item.status === 'active');

  if (!user) {
    res.status(401).json({ status: 'error', message: 'Email hoặc mật khẩu không đúng.' });
    return;
  }

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
  const db = readDatabase();
  const user = decoded ? db.users?.find(item => item.id === decoded.sub && item.status === 'active') : null;

  if (!user) {
    res.status(401).json({ status: 'error', message: 'Bạn cần đăng nhập để truy cập hệ thống.' });
    return;
  }

  (req as any).authUser = toAuthUser(user, db);
  next();
  };
}

export function createAuthMeRouter() {
  const router = Router();

router.get('/api/auth/me', (req: Request, res: Response) => {
  res.json({ status: 'success', data: getAuthUser(req) });
});

router.put('/api/auth/profile', async (req: Request, res: Response) => {
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

  let nextPassword = target.password;
  const newPassword = String(body.new_password || '').trim();
  if (newPassword) {
    const currentPassword = String(body.current_password || '');
    if (!currentPassword || currentPassword !== target.password) {
      res.status(400).json({ status: 'error', message: 'Mật khẩu hiện tại không đúng.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ status: 'error', message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
      return;
    }
    nextPassword = newPassword;
  }

  db.users[index] = {
    ...target,
    name: nextName,
    email: nextEmail,
    phone: nextPhone || undefined,
    bio: nextBio || undefined,
    avatar_url: nextAvatarUrl || undefined,
    public_slug: nextPublicSlug,
    show_public_profile: nextShowPublic,
    password: nextPassword,
  };

  await writeDatabase(db);
  res.json({ status: 'success', data: toAuthUser(db.users[index], db) });
});

  return router;
}
