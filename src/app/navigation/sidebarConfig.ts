import {
  LayoutDashboard,
  Users,
  Home,
  Sparkles,
  FileText,
  MessageSquare,
  Bot,
  Cpu,
  Layers,
  Settings as SettingsIcon,
  TrendingUp,
  Building2,
  Newspaper,
  FolderOpen,
  Tags,
  FileSearch,
  Link2,
  UserCircle,
  ScanSearch,
  Globe,
  FileBarChart,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import type { NavItemConfig } from './navigationTypes';
import { MXH_POSTS_ENABLED } from './tabPaths';
import type { AuthUser } from '../../types';

export const SEO_SUBMENU: NavItemConfig[] = [
  { id: 'seo-posts', label: 'Bài viết', icon: Newspaper, path: '/admin/seo/posts' },
  { id: 'seo-categories', label: 'Chuyên mục', icon: FolderOpen, path: '/admin/seo/categories' },
  { id: 'seo-tags', label: 'Tags', icon: Tags, path: '/admin/seo/tags' },
  { id: 'seo-audit', label: 'SEO Audit', icon: FileSearch, path: '/admin/seo/audit' },
];

export const AGENT_SUBMENU: NavItemConfig[] = [
  { id: 'agent-sources', label: 'Nguồn', icon: Globe, path: '/admin/agents/sources', badgeKey: 'sources' },
  { id: 'agent-runtime', label: 'Runtime', icon: Activity, path: '/admin/agents/runtime' },
  { id: 'agent-reports', label: 'Báo cáo', icon: FileBarChart, path: '/admin/agents/reports' },
  { id: 'agent-notifications', label: 'Thông báo', icon: MessageSquare, path: '/admin/agents/notifications', badgeKey: 'notifications' },
  { id: 'agent-findings', label: 'Lead Intelligence', icon: FileSearch, path: '/admin/agents/findings', badgeKey: 'leadIntelligence' },
];

export function isUserSuperAdmin(user?: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === 'owner' || user.roleKey === 'super_admin';
}

export function isUserTeamLead(user?: AuthUser | null): boolean {
  if (!user) return false;
  return Boolean(user.isTeamLead || user.roleKey === 'team_lead' || user.role === 'company');
}

export function hasUserPermission(user: AuthUser | null | undefined, permissionKey: string): boolean {
  if (!user) return false;
  if (isUserSuperAdmin(user)) return true;
  const p = user.permissions?.[permissionKey];
  return Boolean(p && p.hasAccess && p.scope !== 'none' && !p.requiresPremiumUpgrade);
}

export function hasUserEntitlement(user: AuthUser | null | undefined, feature: string): boolean {
  if (!user) return false;
  if (isUserSuperAdmin(user) || user.isPlatformRootTeam) return true;
  return Boolean(user.entitlements?.includes(feature));
}

export function canAccessSeoMenu(user?: AuthUser | null): boolean {
  if (!user) return false;
  return isUserSuperAdmin(user) || hasUserPermission(user, 'seo_blog.admin');
}

export function canAccessAgentMenu(user?: AuthUser | null): boolean {
  if (!user) return false;
  return (
    isUserSuperAdmin(user) ||
    Boolean(user.isPlatformRootTeam) ||
    hasUserEntitlement(user, 'agent.*') ||
    hasUserEntitlement(user, 'agent.sources') ||
    hasUserPermission(user, 'agent.sources')
  );
}

export function buildPrimaryNavItems(currentUser?: AuthUser | null): NavItemConfig[] {
  const isSuper = isUserSuperAdmin(currentUser);
  const isLead = isUserTeamLead(currentUser);
  const isRoot = Boolean(currentUser?.isPlatformRootTeam);

  const canCrm = isSuper || isRoot || hasUserPermission(currentUser, 'crm') || hasUserEntitlement(currentUser, 'crm');
  const canLeads = isSuper || isRoot || hasUserPermission(currentUser, 'investor_leads') || hasUserEntitlement(currentUser, 'investor_leads');
  const canLeadMagnet = isSuper || isLead || hasUserPermission(currentUser, 'property.distribute');
  const canProjects = isSuper || hasUserPermission(currentUser, 'projects.admin');
  const canAiContent = isSuper || hasUserPermission(currentUser, 'ai_content.admin') || hasUserEntitlement(currentUser, 'ai_content');

  const items: NavItemConfig[] = [
    { id: 'dashboard', label: 'Dashboard tổng quan', icon: LayoutDashboard },
  ];

  if (canCrm) {
    items.push({ id: 'crm', label: 'Khách hàng CRM', icon: Users, badgeKey: 'crm' });
  }

  if (canLeads) {
    items.push({ id: 'investor-leads', label: 'Leads đầu tư', icon: TrendingUp, badgeKey: 'investorLeads' });
  }

  items.push({ id: 'short-links', label: 'Short Links', icon: Link2 });

  if (canLeadMagnet) {
    items.push({ id: 'lead-magnet-content', label: 'Lead Magnet Content', icon: FileText });
  }

  items.push({ id: 'properties', label: 'Danh sách Bất động sản', icon: Home, badgeKey: 'properties' });

  if (canProjects) {
    items.push({ id: 'projects', label: 'Quản trị dự án', icon: Building2 });
  }

  if (canAiContent) {
    items.push({ id: 'ai-content', label: 'AI Content Generator', icon: Sparkles });
  }

  if (MXH_POSTS_ENABLED && isSuper) {
    items.push({ id: 'posts', label: 'Danh sách bài đăng CMS', icon: FileText, badgeKey: 'posts' as const });
  }

  return items;
}

export function buildSecondaryNavItems(opts: {
  currentUser?: AuthUser | null;
  canManageWebsiteChat: boolean;
  canManageCmsUsers: boolean;
  canManageTeam?: boolean;
  canManageRbac?: boolean;
  websiteChatBadge?: number;
  chatHistoryBadge?: number;
  usersBadge?: number;
}): NavItemConfig[] {
  const { currentUser, canManageWebsiteChat, canManageCmsUsers } = opts;
  const isSuper = isUserSuperAdmin(currentUser);
  const isLead = isUserTeamLead(currentUser);
  const isRoot = Boolean(currentUser?.isPlatformRootTeam);

  const canInbox = isSuper || isRoot || hasUserPermission(currentUser, 'fb_inbox') || hasUserEntitlement(currentUser, 'fb_inbox');
  const canAutomations = isSuper || hasUserPermission(currentUser, 'automation.admin');
  const canTeam = isSuper || isLead || opts.canManageTeam || hasUserPermission(currentUser, 'team.members.manage');
  const canRbac = isSuper || opts.canManageRbac || hasUserPermission(currentUser, 'rbac.matrix');
  const canUsers = isSuper || isLead || canManageCmsUsers || hasUserPermission(currentUser, 'user.manage');
  const canIntegrations = isSuper || hasUserPermission(currentUser, 'integrations.system');
  const canSettings = isSuper || hasUserPermission(currentUser, 'settings.system');

  const items: NavItemConfig[] = [];

  if (canInbox) {
    items.push({ id: 'inbox', label: 'Hòm thư inbox đa kênh', icon: MessageSquare, badgeKey: 'pendingInbox' });
  }

  items.push({ id: 'chatbot', label: 'Chatbot AI Nội bộ', icon: Bot });

  if (canManageWebsiteChat) {
    items.push({ id: 'website-chat', label: 'Chat khách website', icon: MessageSquare, badgeKey: 'websiteChat' as const });
    items.push({ id: 'chat-history', label: 'Lịch sử chat', icon: MessageSquare, badgeKey: 'chatHistory' });
  }

  if (canAutomations) {
    items.push({ id: 'automations', label: 'Automation AI Center', icon: Cpu });
  }

  if (canTeam) {
    items.push({ id: 'team', label: 'Quản lý Team', icon: Users });
  }

  if (canRbac) {
    items.push({ id: 'rbac', label: 'Phân quyền & Gói', icon: ShieldCheck });
  }

  if (canUsers) {
    items.push({ id: 'users', label: 'User & Permission', icon: ShieldCheck, badgeKey: 'users' as const });
  }

  items.push({ id: 'profile', label: 'Hồ sơ cá nhân', icon: UserCircle });

  if (canIntegrations) {
    items.push({ id: 'integrations', label: 'Tích hợp tài khoản', icon: Layers });
  }

  if (canSettings) {
    items.push({ id: 'settings', label: 'Cấu hình hệ thống', icon: SettingsIcon });
  }

  return items;
}

/** Extra badge sources not on NavigationCounts API */
export type ExtraNavBadges = {
  websiteChat?: number;
  chatHistory?: number;
  users?: number;
};
