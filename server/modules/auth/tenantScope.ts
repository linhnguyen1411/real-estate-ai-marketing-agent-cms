import type { Request } from 'express';
import { getAuthUser } from './authAccess';

/**
 * Single source of truth for resolving the tenant of an authenticated request.
 *
 * Policy:
 * - Super admins may target any company; omitting the company means "all".
 * - Every other caller is locked to their own company. A user without a
 *   company is locked to a sentinel value that matches no row, so an absent
 *   company can never be interpreted as "all companies".
 */
export const NO_TENANT = '__none__';

export function isSuperAdminUser(user?: { role?: string; roleKey?: string } | null): boolean {
  if (!user) return false;
  if (user.role === 'owner' || user.role === 'super_admin') return true;
  return user.roleKey === 'super_admin';
}

/**
 * Resolve the company id that must be applied to a query.
 * Returns `undefined` only for super admins that explicitly requested "all".
 */
export function resolveRequestCompanyId(req: Request, requested?: unknown): string | undefined {
  const user = getAuthUser(req);
  if (isSuperAdminUser(user)) {
    const value = typeof requested === 'string' ? requested.trim() : '';
    return value || undefined;
  }
  return user?.company_id || NO_TENANT;
}

/** Same as above but always returns a concrete value (never "all"). */
export function resolveRequestCompanyIdStrict(req: Request, requested?: unknown): string {
  const user = getAuthUser(req);
  if (isSuperAdminUser(user)) {
    const value = typeof requested === 'string' ? requested.trim() : '';
    return value || NO_TENANT;
  }
  return user?.company_id || NO_TENANT;
}

/** True when the caller may read/write a record belonging to `companyId`. */
export function canAccessCompany(req: Request, companyId?: string | null): boolean {
  const user = getAuthUser(req);
  if (isSuperAdminUser(user)) return true;
  if (!user?.company_id) return false;
  return companyId === user.company_id;
}

/** Prisma-friendly filter fragment. Super admin = all when companyId undefined. */
export function companyFilter(companyId: string | undefined): { companyId?: string } {
  return companyId ? { companyId } : {};
}
