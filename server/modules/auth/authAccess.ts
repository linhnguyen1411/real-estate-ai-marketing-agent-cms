import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { AuthUser, Property, User } from '../../../src/types';
import { getEnv } from '../../config/env';
import { resolveAgentTier, slugifyAgentProfile } from '../../../src/utils/agentTier';
import { filterPublicProperties } from '../../publicPropertyMapper';

export const getAuthSecret = () => getEnv().AUTH_SECRET;
export const AUTH_SECRET = process.env.AUTH_SECRET || getEnv().AUTH_SECRET;

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
    must_change_password: Boolean(user.must_change_password),
    referral_code: user.referral_code,
  };
}

export function toSafeUser(user: any): Record<string, any> {
  if (!user) return null as any;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    company_id: user.company_id,
    phone: user.phone || '',
    avatar_url: user.avatar_url || '',
    bio: user.bio || '',
    agent_tier: resolveAgentTier(user),
    public_slug: user.public_slug,
    show_public_profile: user.show_public_profile !== false,
    status: user.status || 'active',
    referral_code: user.referral_code,
    created_at: user.created_at,
    updated_at: user.updated_at,
    must_change_password: Boolean(user.must_change_password),
    token_version: user.token_version ?? 1,
  };
}

export function toPublicUser(user: User): any {
  return toSafeUser(user);
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
  const list = (db.properties || []).filter((property: any) => {
    if (['sold', 'hidden'].includes(property.sale_status || 'available')) return false;
    const creatorId = property.created_by_user_id || property.owner_user_id;
    return creatorId === userId;
  });
  return list.length;
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

export function signToken(user: AuthUser, tokenVersion = 1): string {
  const iat = Date.now();
  const jti = crypto.randomUUID();
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    role: user.role,
    company_id: user.company_id,
    token_version: user.token_version ?? tokenVersion,
    jti,
    iat,
    exp: iat + 1000 * 60 * 60, // 1 hour TTL
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyToken(token: string): { sub: string; role: string; company_id?: string; token_version?: number; jti: string; iat: number; exp: number } | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.exp || decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function getAuthUser(req: Request): AuthUser {
  return (req as any).authUser;
}

export function scopeCollection<T extends { company_id?: string; owner_user_id?: string; created_by_user_id?: string; team_id?: string; assigned_member_ids?: string[] }>(items: T[], req: Request): T[] {
  const user = getAuthUser(req);
  if (!user) return [];

  // RBAC scope-based filtering
  if (req.scope) {
    if (req.scope === 'all') return items;
    if (req.scope === 'team') {
      return items.filter(item => {
        if (req.teamId && item.team_id === req.teamId) return true;
        const owner = item.owner_user_id || item.created_by_user_id;
        if (owner === user.id) return true;
        if (Array.isArray(item.assigned_member_ids) && item.assigned_member_ids.includes(user.id)) return true;
        if (user.company_id && item.company_id === user.company_id) return true;
        return false;
      });
    }
    if (req.scope === 'own') {
      return items.filter(item => {
        const owner = item.owner_user_id || item.created_by_user_id;
        return owner === user.id;
      });
    }
    return []; // none
  }

  // Legacy role-based fallback
  if (user.role === 'owner' || (user.role as string) === 'super_admin') return items;
  if (user.role === 'company') {
    // Deny-by-default: record must have company_id and match user's company_id
    return items.filter(item => Boolean(item.company_id) && item.company_id === user.company_id);
  }
  // Member: must match company_id AND be assigned
  return items.filter(item => {
    return Boolean(item.company_id) && item.company_id === user.company_id && (item.assigned_member_ids || []).includes(user.id);
  });
}

export function canAccessResource(resource: { company_id?: string; owner_user_id?: string; created_by_user_id?: string; team_id?: string; assigned_member_ids?: string[] } | undefined, req: Request): boolean {
  if (!resource) return false;
  const user = getAuthUser(req);
  if (!user) return false;

  // RBAC scope check
  if (req.scope) {
    if (req.scope === 'all') return true;
    if (req.scope === 'team') {
      if (req.teamId && resource.team_id === req.teamId) return true;
      const owner = resource.owner_user_id || resource.created_by_user_id;
      if (owner === user.id) return true;
      if (Array.isArray(resource.assigned_member_ids) && resource.assigned_member_ids.includes(user.id)) return true;
      if (user.company_id && resource.company_id === user.company_id) return true;
      return false;
    }
    if (req.scope === 'own') {
      const owner = resource.owner_user_id || resource.created_by_user_id;
      return owner === user.id;
    }
    return false;
  }

  if (user.role === 'owner' || (user.role as string) === 'super_admin') return true;
  // Deny-by-default: missing company_id is only accessible by owner
  if (!resource.company_id) return false;

  if (user.role === 'company') {
    return resource.company_id === user.company_id;
  }
  return resource.company_id === user.company_id && (resource.assigned_member_ids || []).includes(user.id);
}

export function canManageResource(resource: { company_id?: string; owner_user_id?: string; created_by_user_id?: string; team_id?: string; assigned_member_ids?: string[] } | undefined, req: Request): boolean {
  if (!resource) return false;
  const user = getAuthUser(req);
  if (!user) return false;

  // RBAC scope check
  if (req.scope) {
    if (req.scope === 'all') return true;
    if (req.scope === 'team') {
      if (req.teamId && resource.team_id === req.teamId) return true;
      const owner = resource.owner_user_id || resource.created_by_user_id;
      if (owner === user.id) return true;
      if (Array.isArray(resource.assigned_member_ids) && resource.assigned_member_ids.includes(user.id)) return true;
      if (user.company_id && resource.company_id === user.company_id) return true;
      return false;
    }
    if (req.scope === 'own') {
      const owner = resource.owner_user_id || resource.created_by_user_id;
      return owner === user.id;
    }
    return false;
  }

  if (user.role === 'owner' || (user.role as string) === 'super_admin') return true;
  // Deny-by-default: missing company_id is only manageable by owner
  if (!resource.company_id) return false;

  if (user.role === 'company') {
    return resource.company_id === user.company_id;
  }
  return resource.company_id === user.company_id && (resource.assigned_member_ids || []).includes(user.id);
}

export function accessDefaults(req: Request, body: any = {}) {
  const user = getAuthUser(req);
  const isSuperAdmin = user.role === 'owner' || (user.role as string) === 'super_admin';

  // Never trust company_id from body for non-super_admin; remove hardcoded comp-da-nang
  const company_id = isSuperAdmin
    ? (body.company_id !== undefined ? body.company_id : user.company_id)
    : user.company_id;

  // Never trust owner_user_id or created_by_user_id from body for non-super_admin
  const owner_user_id = isSuperAdmin && body.owner_user_id ? body.owner_user_id : user.id;
  const created_by_user_id = user.id;

  // Team ID & listing source
  const team_id = body.team_id || req.teamId;
  const listing_source = body.listing_source || 'broker';

  return {
    company_id,
    owner_user_id,
    created_by_user_id,
    team_id,
    listing_source,
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
