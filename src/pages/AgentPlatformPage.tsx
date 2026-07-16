import React, { Suspense } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { UserRole } from '../types';
import AgentDashboard from '../components/agent/AgentDashboard';
import { AgentPanelLoader } from '../features/agent/shared/AgentPlatformUi';

const SourcesPage = React.lazy(() => import('../features/agent/sources/pages/SourcesPage'));
const MissionsPage = React.lazy(() => import('../features/agent/missions/pages/MissionsPage'));
const JobsPage = React.lazy(() => import('../features/agent/jobs/pages/JobsPage'));
const ScannedContentPage = React.lazy(
  () => import('../features/agent/scanned-content/pages/ScannedContentPage'),
);
const LeadIntelligencePage = React.lazy(
  () => import('../features/agent/lead-intelligence/pages/LeadIntelligencePage'),
);
const ExternalInventoryPage = React.lazy(
  () => import('../features/agent/external-inventory/pages/ExternalInventoryPage'),
);
const NotificationsPage = React.lazy(() => import('../features/agent/notifications/pages/NotificationsPage'));
const SessionsPage = React.lazy(() => import('../features/agent/sessions/pages/SessionsPage'));
const ReportsPage = React.lazy(() => import('../features/agent/reports/pages/ReportsPage'));
const ActionProposalsPage = React.lazy(
  () => import('../features/agent/action-proposals/pages/ActionProposalsPage'),
);
const SpamControlPage = React.lazy(
  () => import('../features/agent/spam-control/pages/SpamControlPage'),
);
const SocialPublishingPage = React.lazy(
  () => import('../features/agent/social-publishing/pages/SocialPublishingPage'),
);

const NAV_ITEMS = [
  { path: '/admin/agents', label: 'Dashboard', end: true },
  { path: '/admin/agents/sources', label: 'Nguồn' },
  { path: '/admin/agents/missions', label: 'Mission' },
  { path: '/admin/agents/jobs', label: 'Jobs' },
  { path: '/admin/agents/publishing', label: 'Đăng bài' },
  { path: '/admin/agents/contents', label: 'Nội dung quét' },
  { path: '/admin/agents/findings', label: 'Lead Intelligence' },
  { path: '/admin/agents/external-inventory', label: 'Giỏ hàng ngoài' },
  { path: '/admin/agents/proposals', label: 'Duyệt phản hồi' },
  { path: '/admin/agents/spam', label: 'Spam Control' },
  { path: '/admin/agents/notifications', label: 'Thông báo' },
  { path: '/admin/agents/sessions', label: 'Sessions' },
  { path: '/admin/agents/reports', label: 'Báo cáo' },
] as const;

type Props = {
  userRole: UserRole;
};

function resolveSection(pathname: string) {
  if (pathname === '/admin/agents' || pathname === '/admin/agents/') return 'dashboard';
  if (pathname.startsWith('/admin/agents/sources')) return 'sources';
  if (pathname.startsWith('/admin/agents/missions')) return 'missions';
  if (pathname.startsWith('/admin/agents/jobs')) return 'jobs';
  if (pathname.startsWith('/admin/agents/publishing')) return 'publishing';
  if (pathname.startsWith('/admin/agents/contents')) return 'contents';
  if (pathname.startsWith('/admin/agents/findings')) return 'findings';
  if (pathname.startsWith('/admin/agents/external-inventory')) return 'external-inventory';
  if (pathname.startsWith('/admin/agents/proposals')) return 'proposals';
  if (pathname.startsWith('/admin/agents/spam')) return 'spam';
  if (pathname.startsWith('/admin/agents/notifications')) return 'notifications';
  if (pathname.startsWith('/admin/agents/sessions')) return 'sessions';
  if (pathname.startsWith('/admin/agents/reports')) return 'reports';
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
        {section === 'sources' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <SourcesPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'missions' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <MissionsPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'jobs' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <JobsPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'publishing' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <SocialPublishingPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'contents' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <ScannedContentPage userRole={userRole} />
          </Suspense>
        )}
        {section === 'findings' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <LeadIntelligencePage userRole={userRole} />
          </Suspense>
        )}
        {section === 'external-inventory' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <ExternalInventoryPage />
          </Suspense>
        )}
        {section === 'proposals' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <ActionProposalsPage />
          </Suspense>
        )}
        {section === 'spam' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <SpamControlPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'notifications' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <NotificationsPage />
          </Suspense>
        )}
        {section === 'sessions' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <SessionsPage />
          </Suspense>
        )}
        {section === 'reports' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <ReportsPage />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export const AGENT_PLATFORM_PATHS = NAV_ITEMS.map(item => item.path);
