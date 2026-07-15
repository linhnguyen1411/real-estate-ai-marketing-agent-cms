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
  { id: 'agent-dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/admin/agents' },
  { id: 'agent-sources', label: 'Nguồn', icon: Globe, path: '/admin/agents/sources', badgeKey: 'sources' },
  { id: 'agent-missions', label: 'Mission', icon: Sparkles, path: '/admin/agents/missions' },
  { id: 'agent-jobs', label: 'Jobs', icon: Clock, path: '/admin/agents/jobs', badgeKey: 'jobs' },
  { id: 'agent-contents', label: 'Nội dung quét', icon: ScanSearch, path: '/admin/agents/contents' },
  { id: 'agent-findings', label: 'Lead Intelligence', icon: FileSearch, path: '/admin/agents/findings', badgeKey: 'leadIntelligence' },
  { id: 'agent-external-inventory', label: 'Giỏ hàng ngoài', icon: Package, path: '/admin/agents/external-inventory', badgeKey: 'externalInventory' },
  { id: 'agent-proposals', label: 'Duyệt phản hồi', icon: ClipboardCheck, path: '/admin/agents/proposals' },
  { id: 'agent-spam', label: 'Spam Control', icon: ShieldCheck, path: '/admin/agents/spam' },
  { id: 'agent-notifications', label: 'Thông báo', icon: MessageSquare, path: '/admin/agents/notifications', badgeKey: 'notifications' },
  { id: 'agent-sessions', label: 'Sessions', icon: Cpu, path: '/admin/agents/sessions' },
  { id: 'agent-reports', label: 'Báo cáo', icon: FileBarChart, path: '/admin/agents/reports' },
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
    ...(MXH_POSTS_ENABLED
      ? [{ id: 'posts', label: 'Danh sách bài đăng CMS', icon: FileText, badgeKey: 'posts' as const }]
      : []),
  ];
}

export function buildSecondaryNavItems(opts: {
  canManageWebsiteChat: boolean;
  canManageCmsUsers: boolean;
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
