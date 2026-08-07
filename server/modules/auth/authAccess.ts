import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { AuthUser, Property, User } from '../../../src/types';
import { resolveAgentTier, slugifyAgentProfile } from '../../../src/utils/agentTier';
import { filterPublicProperties } from '../../publicPropertyMapper';

export const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-only-auth-secret-change-me';

export function toAuthUser(user: User, db: any): AuthUser {
  const company = db.companies?.find((item: any) => item.id === user.company_id);
  const publicSlug = user.public_slug || `${slugifyAgentProfile(user.name)}-${user.id.slice(-4)}`;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    company_id: user.company_id,
    company_name: company?.name,
    phone: user.phone,
    avatar_url: user.avatar_url,
    bio: user.bio,
    agent_tier: resolveAgentTier(user),
    public_slug: publicSlug,
    show_public_profile: user.show_public_profile !== false,
  };
}

export function toPublicAgentProfile(user: User, db: any, propertyCount = 0): any {
  const auth = toAuthUser(user, db);
  if (user.status !== 'active' || user.show_public_profile === false) return null;
  return {
    id: auth.id,
    name: auth.name,
    phone: auth.phone,
    avatar_url: auth.avatar_url,
    bio: auth.bio,
    agent_tier: auth.agent_tier,
    public_slug: auth.public_slug,
    company_name: auth.company_name,
    property_count: propertyCount,
    profile_url: `/moi-gioi/${auth.public_slug}`,
  };
}

export function countPublicAgentProperties(db: any, userId: string): number {
  return filterPublicProperties(db.properties || []).filter((property: Property) => {
    const creatorId = property.created_by_user_id || property.owner_user_id;
    return creatorId === userId;
  }).length;
}

export function assertUniquePublicSlug(db: any, slug: string, userId: string, res: Response): boolean {
  const normalized = slugifyAgentProfile(slug);
  if (!normalized) {
    res.status(400).json({ status: 'error', message: 'Đường dẫn hồ sơ không hợp lệ.' });
    return false;
  }
  const conflict = (db.users || []).some((user: User) => (
    user.id !== userId
    && user.public_slug
    && user.public_slug.toLowerCase() === normalized
  ));
  if (conflict) {
    res.status(409).json({ status: 'error', message: 'Đường dẫn hồ sơ đã được sử dụng.' });
    return false;
  }
  return true;
}

export function signToken(user: AuthUser): string {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    role: user.role,
    company_id: user.company_id,
    exp: Date.now() + 1000 * 60 * 60 * 12
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyToken(token: string): { sub: string; exp: number } | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!decoded.exp || decoded.exp < Date.now()) return null;
  return decoded;
}

export function getAuthUser(req: Request): AuthUser {
  return (req as any).authUser;
}

export function scopeCollection<T extends { company_id?: string; owner_user_id?: string; assigned_member_ids?: string[] }>(items: T[], req: Request): T[] {
  const user = getAuthUser(req);
  if (user.role === 'owner') return items;
  if (user.role === 'company') {
    return items.filter(item => !item.company_id || item.company_id === user.company_id);
  }
  return items.filter(item => {
    const itemCompanyId = item.company_id || user.company_id;
    return itemCompanyId === user.company_id && (item.assigned_member_ids || []).includes(user.id);
  });
}

export function canAccessResource(resource: { company_id?: string; assigned_member_ids?: string[] } | undefined, req: Request): boolean {
  if (!resource) return false;
  const user = getAuthUser(req);
  if (user.role === 'owner') return true;
  if (user.role === 'company') {
    return !resource.company_id || resource.company_id === user.company_id;
  }
  const companyId = resource.company_id || user.company_id;
  return companyId === user.company_id && (resource.assigned_member_ids || []).includes(user.id);
}

export function canManageResource(resource: { company_id?: string; assigned_member_ids?: string[] } | undefined, req: Request): boolean {
  if (!resource) return false;
  const user = getAuthUser(req);
  if (user.role === 'owner') return true;
  if (user.role === 'company') {
    return !resource.company_id || resource.company_id === user.company_id;
  }
  const companyId = resource.company_id || user.company_id;
  return companyId === user.company_id && (resource.assigned_member_ids || []).includes(user.id);
}

export function accessDefaults(req: Request, body: any = {}) {
  const user = getAuthUser(req);
  const company_id = user.role === 'owner' ? (body.company_id || 'comp-da-nang') : user.company_id;
  return {
    company_id,
    owner_user_id: user.role === 'company' ? user.id : body.owner_user_id || user.id,
    assigned_member_ids: user.role === 'member' ? [user.id] : (Array.isArray(body.assigned_member_ids) ? body.assigned_member_ids : [])
  };
}

export function requireOwner(req: Request, res: Response): boolean {
  if (getAuthUser(req).role !== 'owner') {
    res.status(403).json({ status: 'error', message: 'Chỉ Owner có quyền thực hiện thao tác này.' });
    return false;
  }
  return true;
}
