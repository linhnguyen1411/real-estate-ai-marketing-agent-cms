/** Tab ↔ path maps — keep URLs identical to production. */

export const SEO_TAB_TO_PATH: Record<string, string> = {
  'seo-posts': '/admin/seo/posts',
  'seo-categories': '/admin/seo/categories',
  'seo-tags': '/admin/seo/tags',
  'seo-audit': '/admin/seo/audit',
};

export const SEO_PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(SEO_TAB_TO_PATH).map(([tab, path]) => [path, tab]),
);

export const AGENT_TAB_TO_PATH: Record<string, string> = {
  'agent-dashboard': '/admin/agents',
  'agent-sources': '/admin/agents/sources',
  'agent-missions': '/admin/agents/missions',
  'agent-jobs': '/admin/agents/jobs',
  'agent-publishing': '/admin/agents/publishing',
  'agent-publishing-drafts': '/admin/agents/publishing/drafts',
  'agent-publishing-channels': '/admin/agents/publishing/channels',
  'agent-publishing-history': '/admin/agents/publishing/history',
  'agent-publishing-campaigns': '/admin/agents/publishing/campaigns',
  'agent-contents': '/admin/agents/contents',
  'agent-findings': '/admin/agents/findings',
  'agent-external-inventory': '/admin/agents/external-inventory',
  'agent-proposals': '/admin/agents/proposals',
  'agent-spam': '/admin/agents/spam',
  'agent-notifications': '/admin/agents/notifications',
  'agent-sessions': '/admin/agents/sessions',
  'agent-runtime': '/admin/agents/runtime',
  'agent-reports': '/admin/agents/reports',
};

export const AGENT_PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(AGENT_TAB_TO_PATH).map(([tab, path]) => [path, tab]),
);

/** Top-level workspace menus. Feature submenus (SEO/Agent) keep their dedicated paths. */
export const MENU_TAB_TO_SLUG: Record<string, string> = {
  dashboard: 'dashboard',
  crm: 'crm',
  'investor-leads': 'investor-leads',
  'short-links': 'short-links',
  'lead-magnet-content': 'lead-magnet-content',
  properties: 'properties',
  projects: 'projects',
  'ai-content': 'ai-content',
  posts: 'posts',
  chatbot: 'chatbot',
  automations: 'automations',
  team: 'team',
  rbac: 'rbac',
  users: 'users',
  profile: 'profile',
  integrations: 'integrations',
  settings: 'settings',
};

export const MENU_SLUG_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(MENU_TAB_TO_SLUG).map(([tab, slug]) => [slug, tab]),
);

export type WorkspacePortal = 'admin' | 'member';

/** Canonical URL for a menu tab. SEO/Agent stay under /admin (server-side permission gated). */
export function adminTabPath(portal: WorkspacePortal, tab: string): string {
  if (SEO_TAB_TO_PATH[tab]) return SEO_TAB_TO_PATH[tab];
  if (AGENT_TAB_TO_PATH[tab]) return AGENT_TAB_TO_PATH[tab];
  const slug = MENU_TAB_TO_SLUG[tab] || MENU_TAB_TO_SLUG.dashboard;
  return `/${portal === 'admin' ? 'admin' : 'my'}/${slug}`;
}

/** Reverse of adminTabPath. Returns null for unknown/feature-nested routes. */
export function tabFromWorkspacePath(pathname: string): string | null {
  if (pathname === '/admin' || pathname === '/my' || pathname === '/dashboard') return 'dashboard';
  if (SEO_PATH_TO_TAB[pathname]) return SEO_PATH_TO_TAB[pathname];
  if (AGENT_PATH_TO_TAB[pathname]) return AGENT_PATH_TO_TAB[pathname];
  const match = /^\/(?:admin|my)\/([a-z0-9-]+)$/.exec(pathname);
  if (!match) return null;
  return MENU_SLUG_TO_TAB[match[1]] || null;
}

export const ACTIVE_TAB_STORAGE_KEY = 'real_estate_ai_active_tab';

/** MXH posts feature — temporarily disabled (behavior preserved). */
/** MXH CMS posts UI is a legacy stub — prefer AI Agent → Lịch đăng bài (social-publishing). */
export const MXH_POSTS_ENABLED = false;

export function normalizeStoredTab(tab: string): string {
  if (!MXH_POSTS_ENABLED && tab === 'posts') return 'dashboard';
  if (tab === 'facebook') return 'dashboard';
  return tab || 'dashboard';
}
