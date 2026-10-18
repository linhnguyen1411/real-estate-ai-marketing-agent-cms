/**
 * RBAC Core Type Definitions & Constants
 */

export type RoleKey = 'super_admin' | 'team_lead' | 'member' | 'pending_member' | 'independent';

export type PermissionScope = 'all' | 'team' | 'own' | 'none';

export type PermissionKey =
  | 'dashboard'
  | 'property.read'
  | 'property.write'
  | 'property.distribute'
  | 'chatbot.use'
  | 'shortlink.manage'
  | 'profile.edit'
  | 'tool.download'
  | 'team.members.manage'
  | 'team.permissions.edit'
  | 'rbac.matrix'
  | 'entitlement'
  | 'license.manage'
  | 'website_chat'
  | 'crm'
  | 'investor_leads'
  | 'fb_inbox'
  | 'agent.sources'
  | 'agent.runtime'
  | 'agent.reports'
  | 'agent.notifications'
  | 'lead.intel'
  | 'user.manage'
  | 'settings.system'
  | 'integrations.system'
  | 'seo_blog.admin'
  | 'projects.admin'
  | 'ai_content.admin'
  | 'automation.admin'
  | 'appointments.manage';

export interface RolePermissionRule {
  roleKey: RoleKey;
  permissionKey: PermissionKey;
  scope: PermissionScope;
  premiumOnly?: boolean;
}

export interface UserEffectivePermission {
  key: PermissionKey;
  scope: PermissionScope;
  premiumOnly: boolean;
  hasAccess: boolean;
  requiresPremiumUpgrade?: boolean;
}

export interface ResolvedPermissionsResult {
  roleKey: RoleKey;
  teamId?: string;
  isPlatformRootTeam: boolean;
  isTeamLead: boolean;
  status: 'active' | 'pending' | 'suspended';
  permissions: Record<PermissionKey, UserEffectivePermission>;
  activeEntitlementFeatures: Set<string>;
}

export const SCOPE_HIERARCHY: Record<PermissionScope, number> = {
  all: 3,
  team: 2,
  own: 1,
  none: 0,
};

/**
 * Narrow a base scope with an override scope.
 * Guarantees that override can ONLY narrow and NEVER widen permissions.
 */
export function narrowScope(base: PermissionScope, override?: PermissionScope | string | null): PermissionScope {
  if (!override || !(override in SCOPE_HIERARCHY)) return base;
  const oScope = override as PermissionScope;
  return SCOPE_HIERARCHY[oScope] < SCOPE_HIERARCHY[base] ? oScope : base;
}

/**
 * Default Master RBAC Matrix
 */
export const DEFAULT_ROLE_PERMISSIONS_MATRIX: RolePermissionRule[] = [
  // dashboard
  { roleKey: 'super_admin', permissionKey: 'dashboard', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'dashboard', scope: 'team' },
  { roleKey: 'member', permissionKey: 'dashboard', scope: 'own' },
  { roleKey: 'pending_member', permissionKey: 'dashboard', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'dashboard', scope: 'own' },

  // property.read
  { roleKey: 'super_admin', permissionKey: 'property.read', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'property.read', scope: 'team' },
  { roleKey: 'member', permissionKey: 'property.read', scope: 'team' },
  { roleKey: 'pending_member', permissionKey: 'property.read', scope: 'own' },
  { roleKey: 'independent', permissionKey: 'property.read', scope: 'own' },

  // property.write
  { roleKey: 'super_admin', permissionKey: 'property.write', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'property.write', scope: 'team' },
  { roleKey: 'member', permissionKey: 'property.write', scope: 'own' },
  { roleKey: 'pending_member', permissionKey: 'property.write', scope: 'own' },
  { roleKey: 'independent', permissionKey: 'property.write', scope: 'own' },

  // property.distribute
  { roleKey: 'super_admin', permissionKey: 'property.distribute', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'property.distribute', scope: 'team' },
  { roleKey: 'member', permissionKey: 'property.distribute', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'property.distribute', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'property.distribute', scope: 'none' },

  // chatbot.use
  { roleKey: 'super_admin', permissionKey: 'chatbot.use', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'chatbot.use', scope: 'team' },
  { roleKey: 'member', permissionKey: 'chatbot.use', scope: 'own' },
  { roleKey: 'pending_member', permissionKey: 'chatbot.use', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'chatbot.use', scope: 'own' },

  // shortlink.manage
  { roleKey: 'super_admin', permissionKey: 'shortlink.manage', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'shortlink.manage', scope: 'team' },
  { roleKey: 'member', permissionKey: 'shortlink.manage', scope: 'own' },
  { roleKey: 'pending_member', permissionKey: 'shortlink.manage', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'shortlink.manage', scope: 'own' },

  // profile.edit
  { roleKey: 'super_admin', permissionKey: 'profile.edit', scope: 'own' },
  { roleKey: 'team_lead', permissionKey: 'profile.edit', scope: 'own' },
  { roleKey: 'member', permissionKey: 'profile.edit', scope: 'own' },
  { roleKey: 'pending_member', permissionKey: 'profile.edit', scope: 'own' },
  { roleKey: 'independent', permissionKey: 'profile.edit', scope: 'own' },

  // tool.download
  { roleKey: 'super_admin', permissionKey: 'tool.download', scope: 'own' },
  { roleKey: 'team_lead', permissionKey: 'tool.download', scope: 'own' },
  { roleKey: 'member', permissionKey: 'tool.download', scope: 'own' },
  { roleKey: 'pending_member', permissionKey: 'tool.download', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'tool.download', scope: 'own' },

  // team.members.manage
  { roleKey: 'super_admin', permissionKey: 'team.members.manage', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'team.members.manage', scope: 'team' },
  { roleKey: 'member', permissionKey: 'team.members.manage', scope: 'own' },
  { roleKey: 'pending_member', permissionKey: 'team.members.manage', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'team.members.manage', scope: 'own' },

  // team.permissions.edit
  { roleKey: 'super_admin', permissionKey: 'team.permissions.edit', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'team.permissions.edit', scope: 'team' },
  { roleKey: 'member', permissionKey: 'team.permissions.edit', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'team.permissions.edit', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'team.permissions.edit', scope: 'none' },

  // rbac.matrix
  { roleKey: 'super_admin', permissionKey: 'rbac.matrix', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'rbac.matrix', scope: 'none' },
  { roleKey: 'member', permissionKey: 'rbac.matrix', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'rbac.matrix', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'rbac.matrix', scope: 'none' },

  // entitlement
  { roleKey: 'super_admin', permissionKey: 'entitlement', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'entitlement', scope: 'none' },
  { roleKey: 'member', permissionKey: 'entitlement', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'entitlement', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'entitlement', scope: 'none' },

  // license.manage
  { roleKey: 'super_admin', permissionKey: 'license.manage', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'license.manage', scope: 'none' },
  { roleKey: 'member', permissionKey: 'license.manage', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'license.manage', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'license.manage', scope: 'none' },

  // website_chat (chỉ super admin và thành viên team root)
  { roleKey: 'super_admin', permissionKey: 'website_chat', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'website_chat', scope: 'team', premiumOnly: true },
  { roleKey: 'member', permissionKey: 'website_chat', scope: 'team', premiumOnly: true },
  { roleKey: 'pending_member', permissionKey: 'website_chat', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'website_chat', scope: 'none' },

  // crm
  { roleKey: 'super_admin', permissionKey: 'crm', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'crm', scope: 'team', premiumOnly: true },
  { roleKey: 'member', permissionKey: 'crm', scope: 'team', premiumOnly: true },
  { roleKey: 'pending_member', permissionKey: 'crm', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'crm', scope: 'own', premiumOnly: true },

  // investor_leads
  { roleKey: 'super_admin', permissionKey: 'investor_leads', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'investor_leads', scope: 'team', premiumOnly: true },
  { roleKey: 'member', permissionKey: 'investor_leads', scope: 'team', premiumOnly: true },
  { roleKey: 'pending_member', permissionKey: 'investor_leads', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'investor_leads', scope: 'own', premiumOnly: true },

  // fb_inbox
  { roleKey: 'super_admin', permissionKey: 'fb_inbox', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'fb_inbox', scope: 'team', premiumOnly: true },
  { roleKey: 'member', permissionKey: 'fb_inbox', scope: 'team', premiumOnly: true },
  { roleKey: 'pending_member', permissionKey: 'fb_inbox', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'fb_inbox', scope: 'own', premiumOnly: true },

  // agent.sources
  { roleKey: 'super_admin', permissionKey: 'agent.sources', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'agent.sources', scope: 'team', premiumOnly: true },
  { roleKey: 'member', permissionKey: 'agent.sources', scope: 'team', premiumOnly: true },
  { roleKey: 'pending_member', permissionKey: 'agent.sources', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'agent.sources', scope: 'own', premiumOnly: true },

  // agent.runtime
  { roleKey: 'super_admin', permissionKey: 'agent.runtime', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'agent.runtime', scope: 'team', premiumOnly: true },
  { roleKey: 'member', permissionKey: 'agent.runtime', scope: 'team', premiumOnly: true },
  { roleKey: 'pending_member', permissionKey: 'agent.runtime', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'agent.runtime', scope: 'own', premiumOnly: true },

  // agent.reports
  { roleKey: 'super_admin', permissionKey: 'agent.reports', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'agent.reports', scope: 'team', premiumOnly: true },
  { roleKey: 'member', permissionKey: 'agent.reports', scope: 'team', premiumOnly: true },
  { roleKey: 'pending_member', permissionKey: 'agent.reports', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'agent.reports', scope: 'own', premiumOnly: true },

  // agent.notifications
  { roleKey: 'super_admin', permissionKey: 'agent.notifications', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'agent.notifications', scope: 'team', premiumOnly: true },
  { roleKey: 'member', permissionKey: 'agent.notifications', scope: 'team', premiumOnly: true },
  { roleKey: 'pending_member', permissionKey: 'agent.notifications', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'agent.notifications', scope: 'own', premiumOnly: true },

  // lead.intel
  { roleKey: 'super_admin', permissionKey: 'lead.intel', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'lead.intel', scope: 'team', premiumOnly: true },
  { roleKey: 'member', permissionKey: 'lead.intel', scope: 'team', premiumOnly: true },
  { roleKey: 'pending_member', permissionKey: 'lead.intel', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'lead.intel', scope: 'own', premiumOnly: true },

  // user.manage
  { roleKey: 'super_admin', permissionKey: 'user.manage', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'user.manage', scope: 'team' },
  { roleKey: 'member', permissionKey: 'user.manage', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'user.manage', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'user.manage', scope: 'none' },

  // settings.system
  { roleKey: 'super_admin', permissionKey: 'settings.system', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'settings.system', scope: 'none' },
  { roleKey: 'member', permissionKey: 'settings.system', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'settings.system', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'settings.system', scope: 'none' },

  // integrations.system
  { roleKey: 'super_admin', permissionKey: 'integrations.system', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'integrations.system', scope: 'none' },
  { roleKey: 'member', permissionKey: 'integrations.system', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'integrations.system', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'integrations.system', scope: 'none' },

  // seo_blog.admin
  { roleKey: 'super_admin', permissionKey: 'seo_blog.admin', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'seo_blog.admin', scope: 'none' },
  { roleKey: 'member', permissionKey: 'seo_blog.admin', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'seo_blog.admin', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'seo_blog.admin', scope: 'none' },

  // projects.admin
  { roleKey: 'super_admin', permissionKey: 'projects.admin', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'projects.admin', scope: 'none' },
  { roleKey: 'member', permissionKey: 'projects.admin', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'projects.admin', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'projects.admin', scope: 'none' },

  // ai_content.admin
  { roleKey: 'super_admin', permissionKey: 'ai_content.admin', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'ai_content.admin', scope: 'none' },
  { roleKey: 'member', permissionKey: 'ai_content.admin', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'ai_content.admin', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'ai_content.admin', scope: 'none' },

  // automation.admin
  { roleKey: 'super_admin', permissionKey: 'automation.admin', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'automation.admin', scope: 'none' },
  { roleKey: 'member', permissionKey: 'automation.admin', scope: 'none' },
  { roleKey: 'pending_member', permissionKey: 'automation.admin', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'automation.admin', scope: 'none' },

  // appointments.manage
  { roleKey: 'super_admin', permissionKey: 'appointments.manage', scope: 'all' },
  { roleKey: 'team_lead', permissionKey: 'appointments.manage', scope: 'team' },
  { roleKey: 'member', permissionKey: 'appointments.manage', scope: 'own' },
  { roleKey: 'pending_member', permissionKey: 'appointments.manage', scope: 'none' },
  { roleKey: 'independent', permissionKey: 'appointments.manage', scope: 'own' },
];
