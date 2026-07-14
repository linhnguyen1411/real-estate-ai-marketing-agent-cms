import {
  ChevronDown,
  ChevronRight,
  Cpu,
  Newspaper,
  ScanSearch,
} from 'lucide-react';
import type { NavigationCountsView, NavItemConfig } from '../navigation/navigationTypes';
import {
  AGENT_SUBMENU,
  SEO_SUBMENU,
  buildPrimaryNavItems,
  buildSecondaryNavItems,
  type ExtraNavBadges,
} from '../navigation/sidebarConfig';
import { AGENT_TAB_TO_PATH, SEO_TAB_TO_PATH } from '../navigation/tabPaths';

function resolveBadge(
  item: NavItemConfig,
  counts: NavigationCountsView,
  extra: ExtraNavBadges,
): number | undefined {
  if (!item.badgeKey) return undefined;
  if (item.badgeKey === 'websiteChat') return extra.websiteChat ?? 0;
  if (item.badgeKey === 'chatHistory') return extra.chatHistory ?? 0;
  if (item.badgeKey === 'users') return extra.users ?? 0;
  return counts[item.badgeKey as keyof NavigationCountsView] ?? 0;
}

export interface AdminSidebarProps {
  activeTab: string;
  adminMenuOpen: boolean;
  seoMenuOpen: boolean;
  agentMenuOpen: boolean;
  navigationCounts: NavigationCountsView;
  canManageWebsiteChat: boolean;
  canManageCmsUsers: boolean;
  extraBadges: ExtraNavBadges;
  actionLoading: string | null;
  onCloseMenu: () => void;
  onSelectTab: (id: string, opts?: { path?: string; openSeo?: boolean; openAgent?: boolean }) => void;
  onToggleSeoMenu: () => void;
  onToggleAgentMenu: () => void;
  onRunDemoAutomations: () => void;
}

export default function AdminSidebar({
  activeTab,
  adminMenuOpen,
  seoMenuOpen,
  agentMenuOpen,
  navigationCounts,
  canManageWebsiteChat,
  canManageCmsUsers,
  extraBadges,
  actionLoading,
  onCloseMenu,
  onSelectTab,
  onToggleSeoMenu,
  onToggleAgentMenu,
  onRunDemoAutomations,
}: AdminSidebarProps) {
  const primary = buildPrimaryNavItems();
  const secondary = buildSecondaryNavItems({
    canManageWebsiteChat,
    canManageCmsUsers,
  });

  const renderNavButton = (item: NavItemConfig) => {
    const IconComp = item.icon;
    const isSelected = activeTab === item.id;
    const badge = resolveBadge(item, navigationCounts, extraBadges);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onSelectTab(item.id, { path: item.path || '/admin/dashboard' });
          onCloseMenu();
        }}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
          isSelected
            ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400 font-semibold'
            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100 border border-transparent'
        }`}
      >
        <div className="flex items-center gap-3">
          <IconComp
            className={`w-4 h-4 transition-transform group-hover:scale-110 ${
              isSelected ? 'text-rose-500' : 'text-slate-500'
            }`}
          />
          <span>{item.label}</span>
        </div>
        {badge !== undefined && badge > 0 && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isSelected ? 'bg-rose-600 text-white' : 'bg-slate-900 text-slate-400'
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {adminMenuOpen && (
        <button
          type="button"
          aria-label="Đóng menu CMS"
          onClick={onCloseMenu}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 min-h-0 bg-slate-950 border-r border-slate-900 p-4 space-y-2 shrink-0 flex flex-col justify-between overflow-y-auto app-scroll transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0 ${
          adminMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-slate-600 tracking-wider uppercase">
            Menu chính
          </div>
          {primary.map(renderNavButton)}

          <div className="pt-1">
            <button
              type="button"
              onClick={onToggleSeoMenu}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab.startsWith('seo-')
                  ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400 font-semibold'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <Newspaper
                  className={`w-4 h-4 ${activeTab.startsWith('seo-') ? 'text-rose-500' : 'text-slate-500'}`}
                />
                <span>Nội dung SEO</span>
              </div>
              {seoMenuOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {seoMenuOpen && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                {SEO_SUBMENU.map(item => {
                  const IconComp = item.icon;
                  const isSelected = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectTab(item.id, {
                          path: SEO_TAB_TO_PATH[item.id] || '/admin/seo/posts',
                          openSeo: true,
                        });
                        onCloseMenu();
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      <IconComp className="w-3.5 h-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={onToggleAgentMenu}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab.startsWith('agent-')
                  ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400 font-semibold'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <ScanSearch
                  className={`w-4 h-4 ${activeTab.startsWith('agent-') ? 'text-rose-500' : 'text-slate-500'}`}
                />
                <span>AI Agent</span>
              </div>
              {agentMenuOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {agentMenuOpen && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                {AGENT_SUBMENU.map(item => {
                  const IconComp = item.icon;
                  const isSelected = activeTab === item.id;
                  const badge = resolveBadge(item, navigationCounts, extraBadges);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectTab(item.id, {
                          path: AGENT_TAB_TO_PATH[item.id] || '/admin/agents',
                          openAgent: true,
                        });
                        onCloseMenu();
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <IconComp className="w-3.5 h-3.5" />
                        {item.label}
                      </span>
                      {badge !== undefined && badge > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            isSelected ? 'bg-rose-600 text-white' : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {secondary.map(renderNavButton)}
        </div>

        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-900 text-center space-y-3 mt-4">
          <h4 className="text-xs font-semibold text-rose-400">Sandbox Developer</h4>
          <p className="text-2xs text-slate-400 leading-relaxed">
            Tích hợp hệ thống Ollama cục bộ qua endpoint http://localhost:11434 với các model chất lượng Llama3.1
            hoặc Qwen2.5.
          </p>
          <button
            type="button"
            disabled={!!actionLoading}
            onClick={onRunDemoAutomations}
            className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-2 shadow-sm font-medium transition-all disabled:opacity-50"
          >
            <Cpu className="w-3.5 h-3.5 text-rose-500" />
            <span>Chạy Thử Nghiệm Automation</span>
          </button>
        </div>
      </aside>
    </>
  );
}
