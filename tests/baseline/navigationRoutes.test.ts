import { describe, it, expect } from 'vitest';
import {
  MENU_SLUG_TO_TAB,
  MENU_TAB_TO_SLUG,
  adminTabPath,
  tabFromWorkspacePath,
} from '../../src/app/navigation/tabPaths';
import { buildOfficialSystemPrompt } from '../../server/modules/chat/ragKnowledgeService';

describe('workspace menu routes', () => {
  it('maps every menu tab to a unique slug', () => {
    const slugs = Object.values(MENU_TAB_TO_SLUG);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const [tab, slug] of Object.entries(MENU_TAB_TO_SLUG)) {
      expect(MENU_SLUG_TO_TAB[slug]).toBe(tab);
    }
  });

  it('builds portal-specific paths and resolves them back', () => {
    for (const tab of Object.keys(MENU_TAB_TO_SLUG)) {
      const adminPath = adminTabPath('admin', tab);
      const memberPath = adminTabPath('member', tab);
      expect(adminPath.startsWith('/admin/')).toBe(true);
      expect(memberPath.startsWith('/my/')).toBe(true);
      expect(tabFromWorkspacePath(adminPath)).toBe(tab);
      expect(tabFromWorkspacePath(memberPath)).toBe(tab);
    }
  });

  it('keeps SEO and agent workspaces under /admin', () => {
    expect(adminTabPath('member', 'seo-posts')).toBe('/admin/seo/posts');
    expect(adminTabPath('member', 'agent-sources')).toBe('/admin/agents/sources');
    expect(tabFromWorkspacePath('/admin/seo/tags')).toBe('seo-tags');
    expect(tabFromWorkspacePath('/admin/agents/jobs')).toBe('agent-jobs');
  });

  it('rejects unknown menu paths', () => {
    expect(tabFromWorkspacePath('/admin/khong-ton-tai')).toBeNull();
    expect(tabFromWorkspacePath('/my/khong-ton-tai')).toBeNull();
    expect(tabFromWorkspacePath('/admin/agents/campaign-center')).toBeNull();
  });
});

describe('AI assistant menu links', () => {
  it('links members to /my menu routes instead of /admin or hash tabs', () => {
    const prompt = buildOfficialSystemPrompt({ userRole: 'member', roleKey: 'member' });
    expect(prompt).toContain('[Danh sách Bất động sản](/my/properties)');
    expect(prompt).toContain('[Hồ sơ cá nhân](/my/profile)');
    expect(prompt).not.toContain('/admin#');
    expect(prompt).not.toMatch(/\]\([^)]*#/);
    expect(prompt).not.toMatch(/\]\(\/admin\//);
  });

  it('links super admins to /admin menu routes', () => {
    const prompt = buildOfficialSystemPrompt({ userRole: 'owner', roleKey: 'super_admin' });
    expect(prompt).toContain('[Danh sách Bất động sản](/admin/properties)');
    expect(prompt).toContain('[Phân quyền & Gói](/admin/rbac)');
    expect(prompt).not.toContain('/admin#');
    expect(prompt).not.toMatch(/\]\(\/my\//);
  });
});
