import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { UserRole } from '../types';
import AgentDashboard from '../components/agent/AgentDashboard';
import AgentSources from '../components/agent/AgentSources';
import AgentMissions from '../components/agent/AgentMissions';
import AgentJobs from '../components/agent/AgentJobs';
import AgentFindings from '../components/agent/AgentFindings';
import AgentNotifications from '../components/agent/AgentNotifications';
import BrowserSessions from '../components/agent/BrowserSessions';

const NAV_ITEMS = [
  { path: '/admin/agents', label: 'Dashboard', end: true },
  { path: '/admin/agents/sources', label: 'Nguồn' },
  { path: '/admin/agents/missions', label: 'Mission' },
  { path: '/admin/agents/jobs', label: 'Jobs' },
  { path: '/admin/agents/findings', label: 'Findings' },
  { path: '/admin/agents/notifications', label: 'Thông báo' },
  { path: '/admin/agents/sessions', label: 'Sessions' },
] as const;

type Props = {
  userRole: UserRole;
};

function resolveSection(pathname: string) {
  if (pathname === '/admin/agents' || pathname === '/admin/agents/') return 'dashboard';
  if (pathname.startsWith('/admin/agents/sources')) return 'sources';
  if (pathname.startsWith('/admin/agents/missions')) return 'missions';
  if (pathname.startsWith('/admin/agents/jobs')) return 'jobs';
  if (pathname.startsWith('/admin/agents/findings')) return 'findings';
  if (pathname.startsWith('/admin/agents/notifications')) return 'notifications';
  if (pathname.startsWith('/admin/agents/sessions')) return 'sessions';
  return 'dashboard';
}

export default function AgentPlatformPage({ userRole }: Props) {
  const location = useLocation();
  const section = resolveSection(location.pathname);
  const canManage = userRole === 'owner' || userRole === 'company';

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-1">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={'end' in item ? item.end : false}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200 border border-transparent'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="min-h-0">
        {section === 'dashboard' && <AgentDashboard />}
        {section === 'sources' && <AgentSources canManage={canManage} />}
        {section === 'missions' && <AgentMissions canManage={canManage} />}
        {section === 'jobs' && <AgentJobs />}
        {section === 'findings' && <AgentFindings userRole={userRole} />}
        {section === 'notifications' && <AgentNotifications />}
        {section === 'sessions' && <BrowserSessions />}
      </div>
    </div>
  );
}

export const AGENT_PLATFORM_PATHS = NAV_ITEMS.map(item => item.path);
