import {
  type RoleKey,
  type PermissionKey,
  type PermissionScope,
  type ResolvedPermissionsResult,
  type UserEffectivePermission,
  DEFAULT_ROLE_PERMISSIONS_MATRIX,
  narrowScope,
} from './rbacTypes';
import {
  getTeamById,
  getTeamByLeadUserId,
  getTeamMember,
  getTeamPermissionOverrides,
  getAllRolePermissions,
  getActiveEntitlements,
  getPlatformRootTeam,
} from './rbacRepository';

export interface AuthUserInput {
  id: string;
  role?: string;
  email?: string;
  company_id?: string;
}

export function matchesFeature(activeFeatures: Set<string>, permKey: string): boolean {
  if (activeFeatures.has('*')) return true;
  if (activeFeatures.has(permKey)) return true;

  // Wildcard patterns
  if (permKey.startsWith('agent.') && activeFeatures.has('agent.*')) return true;
  if (permKey === 'tool.download' && (activeFeatures.has('tool.exe') || activeFeatures.has('tool.*'))) return true;
  if (permKey === 'investor_leads' && (activeFeatures.has('leads') || activeFeatures.has('leads.*'))) return true;

  return false;
}

interface CachedPermissions {
  result: ResolvedPermissionsResult;
  expiresAt: number;
}
const userPermissionsCache = new Map<string, CachedPermissions>();

export function clearUserPermissionsCache(userId?: string) {
  if (userId) {
    for (const key of userPermissionsCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        userPermissionsCache.delete(key);
      }
    }
  } else {
    userPermissionsCache.clear();
  }
}

/**
 * Resolve effective permissions and entitlement state for a user.
 */
export async function resolvePermissions(user: AuthUserInput): Promise<ResolvedPermissionsResult> {
  const cacheKey = `${user.id}:${user.role || ''}`;
  const cached = userPermissionsCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  let roleKey: RoleKey = 'independent';
  let teamId: string | undefined;
  let isPlatformRootTeam = false;
  let isTeamLead = false;
  let status: 'active' | 'pending' | 'suspended' = 'active';

  // 1. Check Super Admin / Owner
  if (user.role === 'owner' || user.role === 'super_admin') {
    roleKey = 'super_admin';
    isPlatformRootTeam = true;
    const ledTeam = await getTeamByLeadUserId(user.id);
    if (ledTeam) {
      teamId = ledTeam.id;
    } else {
      const rootTeam = await getPlatformRootTeam();
      if (rootTeam) {
        teamId = rootTeam.id;
      }
    }
  } else {
    // 2. Check if Team Lead
    const ledTeam = await getTeamByLeadUserId(user.id);
    if (ledTeam) {
      roleKey = 'team_lead';
      teamId = ledTeam.id;
      isPlatformRootTeam = ledTeam.isPlatformRoot;
      isTeamLead = true;
      status = 'active';
    } else {
      // 3. Check if Team Member
      const membership = await getTeamMember(user.id);
      if (membership) {
        teamId = membership.teamId;
        const parentTeam = await getTeamById(membership.teamId);
        isPlatformRootTeam = Boolean(parentTeam?.isPlatformRoot);

        if (membership.status === 'approved') {
          roleKey = 'member';
          status = 'active';
        } else if (membership.status === 'suspended') {
          roleKey = 'pending_member';
          status = 'suspended';
        } else {
          roleKey = 'pending_member';
          status = 'pending';
        }
      } else {
        // 4. Independent user
        roleKey = 'independent';
        status = 'active';
      }
    }
  }

  // 2. Collect Entitlements
  const activeFeatures = new Set<string>();

  if (roleKey === 'super_admin') {
    activeFeatures.add('*');
  } else {
    // Root team members get default access to root features
    if (isPlatformRootTeam && status === 'active') {
      activeFeatures.add('website_chat');
      activeFeatures.add('crm');
      activeFeatures.add('investor_leads');
      activeFeatures.add('fb_inbox');
    }

    // User-specific active entitlements
    const userEntitlements = await getActiveEntitlements('user', user.id);
    for (const ent of userEntitlements) {
      for (const feat of ent.features) {
        activeFeatures.add(feat);
      }
    }

    // Team-inherited entitlements (ONLY for team_lead or approved members!)
    // P1 Requirement: no premium inheritance for pending members
    if (teamId && (roleKey === 'team_lead' || (roleKey === 'member' && status === 'active'))) {
      const teamEntitlements = await getActiveEntitlements('team', teamId);
      for (const ent of teamEntitlements) {
        for (const feat of ent.features) {
          activeFeatures.add(feat);
        }
      }
    }
  }

  // 3. Load Role Permission Rules
  const allRules = await getAllRolePermissions();
  const roleRules = (allRules.length > 0 ? allRules : DEFAULT_ROLE_PERMISSIONS_MATRIX).filter(
    (r) => r.roleKey === roleKey
  );

  const ruleMap = new Map<string, { scope: PermissionScope; premiumOnly: boolean }>();
  for (const r of roleRules) {
    ruleMap.set(r.permissionKey, { scope: r.scope, premiumOnly: Boolean(r.premiumOnly) });
  }

  // 4. Load Team Permission Overrides
  const overrides = teamId && roleKey !== 'super_admin' ? await getTeamPermissionOverrides(teamId) : {};

  // 5. Build effective permissions map
  const permissions: Record<PermissionKey, UserEffectivePermission> = {} as any;

  // List of all keys defined in default matrix
  const distinctKeys = Array.from(new Set(DEFAULT_ROLE_PERMISSIONS_MATRIX.map((r) => r.permissionKey)));

  for (const key of distinctKeys) {
    const base = ruleMap.get(key) || { scope: 'none' as PermissionScope, premiumOnly: false };
    const overrideScope = overrides[key];

    // Narrowing only: override can only narrow, never widen
    const effectiveScope = narrowScope(base.scope, overrideScope);
    const premiumOnly = base.premiumOnly;

    // Special check for website_chat: must be platform root team
    if (key === 'website_chat' && roleKey !== 'super_admin' && !isPlatformRootTeam) {
      permissions[key] = {
        key,
        scope: 'none',
        premiumOnly,
        hasAccess: false,
        requiresPremiumUpgrade: false,
      };
      continue;
    }

    let hasAccess = false;
    let requiresPremiumUpgrade = false;

    if (effectiveScope === 'none') {
      hasAccess = false;
    } else if (premiumOnly) {
      if (roleKey === 'super_admin' || matchesFeature(activeFeatures, key)) {
        hasAccess = true;
      } else {
        hasAccess = false;
        requiresPremiumUpgrade = true;
      }
    } else {
      hasAccess = true;
    }

    permissions[key] = {
      key,
      scope: effectiveScope,
      premiumOnly,
      hasAccess,
      requiresPremiumUpgrade,
    };
  }

  const resolvedResult: ResolvedPermissionsResult = {
    roleKey,
    teamId,
    isPlatformRootTeam,
    isTeamLead,
    status,
    permissions,
    activeEntitlementFeatures: activeFeatures,
  };

  userPermissionsCache.set(cacheKey, {
    result: resolvedResult,
    expiresAt: now + 30_000,
  });

  return resolvedResult;
}

/**
 * Build Prisma WHERE filter from scope
 */
export function buildScopeWhere(scope: PermissionScope, userId: string, teamId?: string): Record<string, any> {
  switch (scope) {
    case 'all':
      return {};
    case 'team':
      if (teamId) {
        return {
          OR: [{ teamId }, { ownerUserId: userId }],
        };
      }
      return { ownerUserId: userId };
    case 'own':
      return { ownerUserId: userId };
    case 'none':
    default:
      return { id: '__none__' };
  }
}

/**
 * Memory scope filter for in-memory collections
 */
export function filterByScope<
  T extends {
    owner_user_id?: string;
    created_by_user_id?: string;
    team_id?: string;
    assigned_member_ids?: string[];
  }
>(items: T[], scope: PermissionScope, userId: string, teamId?: string): T[] {
  switch (scope) {
    case 'all':
      return items;
    case 'team':
      return items.filter((item) => {
        if (teamId && item.team_id === teamId) return true;
        const owner = item.owner_user_id || item.created_by_user_id;
        if (owner === userId) return true;
        if (Array.isArray(item.assigned_member_ids) && item.assigned_member_ids.includes(userId)) return true;
        return false;
      });
    case 'own':
      return items.filter((item) => {
        const owner = item.owner_user_id || item.created_by_user_id;
        return owner === userId;
      });
    case 'none':
    default:
      return [];
  }
}
