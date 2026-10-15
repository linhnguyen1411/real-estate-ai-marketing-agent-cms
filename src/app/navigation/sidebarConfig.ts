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
  ClipboardCheck,
  Package,
  Link2,
  UserCircle,
  ScanSearch,
  Globe,
  Clock,
  FileBarChart,
  ShieldCheck,
  CalendarDays,
  FilePenLine,
  Share2,
  History,
  Megaphone,
  Activity,
} from 'lucide-react';
import type { NavItemConfig } from './navigationTypes';
import { MXH_POSTS_ENABLED } from './tabPaths';

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

export function buildPrimaryNavItems(): NavItemConfig[] {
  return [
    { id: 'dashboard', label: 'Dashboard tổng quan', icon: LayoutDashboard },
    { id: 'crm', label: 'Khách hàng CRM', icon: Users, badgeKey: 'crm' },
    { id: 'investor-leads', label: 'Leads đầu tư', icon: TrendingUp, badgeKey: 'investorLeads' },
    { id: 'short-links', label: 'Short Links', icon: Link2 },
    { id: 'lead-magnet-content', label: 'Lead Magnet Content', icon: FileText },
    { id: 'properties', label: 'Danh sách Bất động sản', icon: Home, badgeKey: 'properties' },
    { id: 'projects', label: 'Quản trị dự án', icon: Building2 },
    { id: 'ai-content', label: 'AI Content Generator', icon: Sparkles },
    // Legacy stub: CMS MXH posts list — keep flag false; use AI Agent → Lịch đăng bài instead.
    ...(MXH_POSTS_ENABLED
      ? [{ id: 'posts', label: 'Danh sách bài đăng CMS', icon: FileText, badgeKey: 'posts' as const }]
      : []),
  ];
}

export function buildSecondaryNavItems(opts: {
  canManageWebsiteChat: boolean;
  canManageCmsUsers: boolean;
  canManageTeam?: boolean;
  canManageRbac?: boolean;
  websiteChatBadge?: number;
  chatHistoryBadge?: number;
  usersBadge?: number;
}): NavItemConfig[] {
  return [
    { id: 'inbox', label: 'Hòm hòm inbox đa kênh', icon: MessageSquare, badgeKey: 'pendingInbox' },
    { id: 'chatbot', label: 'Chatbot AI Nội bộ', icon: Bot },
    ...(opts.canManageWebsiteChat
      ? [{ id: 'website-chat', label: 'Chat khách website', icon: MessageSquare, badgeKey: 'websiteChat' as const }]
      : []),
    { id: 'chat-history', label: 'Lịch sử chat', icon: MessageSquare, badgeKey: 'chatHistory' },
    { id: 'automations', label: 'Automation AI Center', icon: Cpu },
    ...(opts.canManageTeam
      ? [{ id: 'team', label: 'Quản lý Team', icon: Users }]
      : []),
    ...(opts.canManageRbac
      ? [{ id: 'rbac', label: 'Phân quyền & Gói', icon: ShieldCheck }]
      : []),
    ...(opts.canManageCmsUsers
      ? [{ id: 'users', label: 'User & Permission', icon: ShieldCheck, badgeKey: 'users' as const }]
      : []),
    { id: 'profile', label: 'Hồ sơ cá nhân', icon: UserCircle },
    { id: 'integrations', label: 'Tích hợp tài khoản', icon: Layers },
    { id: 'settings', label: 'Cấu hình hệ thống', icon: SettingsIcon },
  ];
}

/** Extra badge sources not on NavigationCounts API */
export type ExtraNavBadges = {
  websiteChat?: number;
  chatHistory?: number;
  users?: number;
};
