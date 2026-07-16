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
  'agent-contents': '/admin/agents/contents',
  'agent-findings': '/admin/agents/findings',
  'agent-external-inventory': '/admin/agents/external-inventory',
  'agent-proposals': '/admin/agents/proposals',
  'agent-spam': '/admin/agents/spam',
  'agent-notifications': '/admin/agents/notifications',
  'agent-sessions': '/admin/agents/sessions',
  'agent-reports': '/admin/agents/reports',
};

export const AGENT_PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(AGENT_TAB_TO_PATH).map(([tab, path]) => [path, tab]),
);

export const ACTIVE_TAB_STORAGE_KEY = 'real_estate_ai_active_tab';

/** MXH posts feature — temporarily disabled (behavior preserved). */
/** MXH CMS posts UI is a legacy stub — prefer AI Agent → Lịch đăng bài (social-publishing). */
export const MXH_POSTS_ENABLED = false;

export function normalizeStoredTab(tab: string): string {
  if (!MXH_POSTS_ENABLED && tab === 'posts') return 'dashboard';
  if (tab === 'facebook') return 'dashboard';
  return tab || 'dashboard';
}
