import type { PermissionScope, ResolvedPermissionsResult } from '../rbac/rbacTypes';

export type AgentRoleKey = 'super_admin' | 'team_lead' | 'member' | 'independent' | 'pending_member';

export type AgentDataScope = 'all' | 'team' | 'own' | 'none';

export interface AgentCapabilities {
  roleKey: AgentRoleKey;
  roleLabel: string;
  portal: 'admin' | 'my';
  scope: AgentDataScope;
  canScan: boolean;
  canManageSources: boolean;
  canPublish: boolean;
  canViewReports: boolean;
  canUseNotifications: boolean;
  canManageVps: boolean;
  canManageDevices: boolean;
}

const ROLE_LABELS: Record<AgentRoleKey, string> = {
  super_admin: 'Quản trị viên',
  team_lead: 'Trưởng nhóm',
  member: 'Thành viên',
  independent: 'Cá nhân',
  pending_member: 'Chờ duyệt',
};

function hasFeature(features: string[], key: string): boolean {
  if (features.includes('*') || features.includes(key)) return true;
  if (key.startsWith('agent.') && features.includes('agent.*')) return true;
  return false;
}

function scopeForRole(roleKey: AgentRoleKey): AgentDataScope {
  if (roleKey === 'super_admin') return 'all';
  if (roleKey === 'team_lead' || roleKey === 'member') return 'team';
  if (roleKey === 'independent') return 'own';
  return 'none';
}

/**
 * Translate RBAC + entitlement data into the capability set the desktop agent
 * enforces in its UI and main process. `tool.exe` counts as the agent license,
 * so trial accounts (features: ['tool.exe']) keep scan/publish access.
 */
export function buildAgentCapabilities(
  resolved: ResolvedPermissionsResult,
  features: string[],
): AgentCapabilities {
  const roleKey = (resolved.roleKey || 'independent') as AgentRoleKey;
  const hasTool = hasFeature(features, 'tool.exe') || features.includes('*');
  const perm = (key: 'agent.runtime' | 'agent.sources' | 'agent.reports' | 'agent.notifications') =>
    Boolean(resolved.permissions?.[key]?.hasAccess);

  const canScan =
    roleKey !== 'pending_member' &&
    (perm('agent.runtime') || hasFeature(features, 'agent.runtime') || hasTool);
  const canManageSources =
    roleKey !== 'pending_member' &&
    (perm('agent.sources') || hasFeature(features, 'agent.sources'));
  const canPublish = canScan;
  const canViewReports =
    roleKey !== 'pending_member' &&
    (perm('agent.reports') || hasFeature(features, 'agent.reports'));
  const canUseNotifications =
    roleKey !== 'pending_member' &&
    (perm('agent.notifications') || hasFeature(features, 'agent.notifications') || hasTool);

  return {
    roleKey,
    roleLabel: ROLE_LABELS[roleKey] || roleKey,
    portal: roleKey === 'super_admin' ? 'admin' : 'my',
    scope: scopeForRole(roleKey),
    canScan,
    canManageSources,
    canPublish,
    canViewReports,
    canUseNotifications,
    canManageVps: roleKey === 'super_admin',
    canManageDevices: roleKey === 'super_admin',
  };
}

export function capabilityScopes(capabilities: AgentCapabilities): string[] {
  const scopes = new Set<string>(['findings:ingest', `role:${capabilities.roleKey}`]);
  if (capabilities.canScan) {
    scopes.add('agent.scan');
    // Read-only access to the scan source list; editing sources stays a CMS/RBAC action.
    scopes.add('agent.sources');
  }
  if (capabilities.canPublish) {
    scopes.add('agent.properties');
    scopes.add('agent.ai');
  }
  if (capabilities.canViewReports) scopes.add('agent.reports');
  if (capabilities.canUseNotifications) scopes.add('agent.notifications');
  return Array.from(scopes);
}

export function scopeForPermission(scope: PermissionScope): AgentDataScope {
  if (scope === 'all' || scope === 'team' || scope === 'own') return scope;
  return 'none';
}
