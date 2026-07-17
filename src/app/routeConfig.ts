/**
 * Admin route inventory — URLs must stay stable.
 * Today all paths still mount the same AdminApp; this config is the
 * single source for architecture tests and future AppRouter composition.
 */
export type AdminRouteDef = {
  path: string;
  tabId?: string;
  layout: 'admin';
  permission?: 'auth' | 'company_admin';
  group: 'core' | 'seo' | 'agent' | 'auth';
};

export const ADMIN_ROUTE_CONFIG: AdminRouteDef[] = [
  { path: '/admin/login', layout: 'admin', permission: 'auth', group: 'auth' },
  { path: '/admin/dashboard', tabId: 'dashboard', layout: 'admin', permission: 'auth', group: 'core' },
  { path: '/admin/seo/posts', tabId: 'seo-posts', layout: 'admin', permission: 'auth', group: 'seo' },
  { path: '/admin/seo/categories', tabId: 'seo-categories', layout: 'admin', permission: 'auth', group: 'seo' },
  { path: '/admin/seo/tags', tabId: 'seo-tags', layout: 'admin', permission: 'auth', group: 'seo' },
  { path: '/admin/seo/audit', tabId: 'seo-audit', layout: 'admin', permission: 'auth', group: 'seo' },
  { path: '/admin/agents', tabId: 'agent-dashboard', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/sources', tabId: 'agent-sources', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/missions', tabId: 'agent-missions', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/jobs', tabId: 'agent-jobs', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/publishing', tabId: 'agent-publishing', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/publishing/drafts', tabId: 'agent-publishing-drafts', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/publishing/channels', tabId: 'agent-publishing-channels', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/publishing/history', tabId: 'agent-publishing-history', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/publishing/campaigns', tabId: 'agent-publishing-campaigns', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/contents', tabId: 'agent-contents', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/findings', tabId: 'agent-findings', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/external-inventory', tabId: 'agent-external-inventory', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/proposals', tabId: 'agent-proposals', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/spam', tabId: 'agent-spam', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/notifications', tabId: 'agent-notifications', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/sessions', tabId: 'agent-sessions', layout: 'admin', permission: 'auth', group: 'agent' },
  { path: '/admin/agents/reports', tabId: 'agent-reports', layout: 'admin', permission: 'auth', group: 'agent' },
];

export function listAdminPaths(): string[] {
  return ADMIN_ROUTE_CONFIG.map(r => r.path);
}

export function findDuplicateAdminPaths(): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const path of listAdminPaths()) {
    if (seen.has(path)) dupes.push(path);
    seen.add(path);
  }
  return dupes;
}
