import React, { Suspense } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import { SITE } from '../../seo/siteConfig';
import type { AuthUser, AppSettings } from '../../types';

const AgentNotificationBell = React.lazy(() => import('../../components/agent/AgentNotificationBell'));

export interface AdminHeaderProps {
  currentUser: AuthUser;
  settings: AppSettings;
  refreshing: boolean;
  onOpenMenu: () => void;
  onOpenProfile: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

export default function AdminHeader({
  currentUser,
  settings,
  refreshing,
  onOpenMenu,
  onOpenProfile,
  onRefresh,
  onLogout,
}: AdminHeaderProps) {
  return (
    <header className="shrink-0 border-b border-slate-900 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-30 px-3 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          className="lg:hidden p-2 text-slate-300 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700"
          aria-label="Mở menu CMS"
        >
          <Menu className="w-5 h-5" />
        </button>
        <img
          src={SITE.logo}
          alt={SITE.name}
          className="h-9 w-auto max-w-[110px] rounded-lg object-contain bg-white/95 p-1"
        />
        <div className="min-w-0">
          <h1 className="truncate text-sm sm:text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Real Estate AI Marketing Agent CMS
          </h1>
          <p className="hidden sm:block text-xs text-slate-500 font-mono">MVP Production Framework v1.0 • Connected • Việt Nam</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={onOpenProfile}
          className="hidden lg:flex flex-col items-end leading-tight rounded-lg px-2 py-1 transition-colors hover:bg-slate-900/60"
          title="Hồ sơ cá nhân"
        >
          <span className="text-xs font-bold text-slate-200">{currentUser.name}</span>
          <span className="text-[11px] text-slate-500 uppercase">
            {currentUser.role}{currentUser.company_name ? ` · ${currentUser.company_name}` : ''}
          </span>
        </button>

        <div className="hidden md:flex items-center gap-2 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-slate-300">
            AI Powered:{' '}
            <span className="text-rose-400 uppercase font-bold">
              {settings.ai_mode} ({settings.ai_mode === 'openai' ? settings.openai_model : settings.ollama_model})
            </span>
          </span>
        </div>

        <Suspense fallback={null}>
          <AgentNotificationBell />
        </Suspense>

        <button
          type="button"
          onClick={onRefresh}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all"
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="px-3 py-2 text-xs font-bold text-slate-300 hover:text-white rounded-lg border border-slate-800 hover:border-rose-500/60 transition-all"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
