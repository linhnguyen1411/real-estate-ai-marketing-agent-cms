import React, { Suspense } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { UserRole } from '../types';
import { AgentPanelLoader } from '../features/agent/shared/AgentPlatformUi';

const ExecutiveDashboardPage = React.lazy(
  () => import('../features/agent/executive-dashboard/pages/ExecutiveDashboardPage'),
);
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
const RuntimeMonitorPage = React.lazy(
  () => import('../features/agent/runtime-monitor/pages/RuntimeMonitorPage'),
);
const ReportsPage = React.lazy(() => import('../features/agent/reports/pages/ReportsPage'));
const ActionProposalsPage = React.lazy(
  () => import('../features/agent/action-proposals/pages/ActionProposalsPage'),
);
const SpamControlPage = React.lazy(
  () => import('../features/agent/spam-control/pages/SpamControlPage'),
);
const PublishingSchedulePage = React.lazy(
  () => import('../features/agent/publishing-schedule/pages/PublishingSchedulePage'),
);
const PublishingDraftsPage = React.lazy(
  () => import('../features/agent/publishing-drafts/pages/PublishingDraftsPage'),
);
const PublishingChannelsPage = React.lazy(
  () => import('../features/agent/publishing-channels/pages/PublishingChannelsPage'),
);
const PublishingHistoryPage = React.lazy(
  () => import('../features/agent/publishing-history/pages/PublishingHistoryPage'),
);
const PublishingCampaignsPage = React.lazy(
  () => import('../features/agent/publishing-campaigns/pages/PublishingCampaignsPage'),
);
const CampaignCenterPage = React.lazy(
  () => import('../features/agent/campaign-center/pages/CampaignCenterPage'),
);
const LeadCenterPage = React.lazy(
  () => import('../features/agent/lead-center/pages/LeadCenterPage'),
);
const MarketingCenterPage = React.lazy(
  () => import('../features/agent/marketing-center/pages/MarketingCenterPage'),
);
const AiProvidersPage = React.lazy(
  () => import('../features/agent/ai-providers/pages/AiProvidersPage'),
);
const DecisionCenterPage = React.lazy(
  () => import('../features/agent/decision-center/pages/DecisionCenterPage'),
);
const KnowledgeCenterPage = React.lazy(
  () => import('../features/agent/knowledge-center/pages/KnowledgeCenterPage'),
);
const KnowledgeAnalyticsPage = React.lazy(
  () => import('../features/agent/knowledge-analytics/pages/KnowledgeAnalyticsPage'),
);
const FeedbackCenterPage = React.lazy(
  () => import('../features/agent/feedback-center/pages/FeedbackCenterPage'),
);

type HubId = 'executive' | 'marketing' | 'lead' | 'sales' | 'operations' | 'knowledge';

const HUBS: Array<{
  id: HubId;
  label: string;
  path: string;
  end?: boolean;
  match: (pathname: string) => boolean;
  subnav: Array<{ path: string; label: string; end?: boolean }>;
}> = [
  {
    id: 'executive',
    label: 'Executive',
    path: '/admin/agents',
    end: true,
    match: p => p === '/admin/agents' || p === '/admin/agents/',
    subnav: [],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    path: '/admin/agents/marketing-center',
    match: p =>
      p.startsWith('/admin/agents/marketing-center') ||
      p.startsWith('/admin/agents/campaign-center') ||
      p.startsWith('/admin/agents/publishing'),
    subnav: [
      { path: '/admin/agents/marketing-center', label: 'Calendar / ROI' },
      { path: '/admin/agents/campaign-center', label: 'Campaign' },
      { path: '/admin/agents/publishing', label: 'Publishing' },
    ],
  },
  {
    id: 'lead',
    label: 'Lead',
    path: '/admin/agents/decision-center',
    match: p =>
      p.startsWith('/admin/agents/decision-center') ||
      p.startsWith('/admin/agents/findings') ||
      p.startsWith('/admin/agents/contents') ||
      p.startsWith('/admin/agents/spam') ||
      p.startsWith('/admin/agents/external-inventory') ||
      p.startsWith('/admin/agents/proposals'),
    subnav: [
      { path: '/admin/agents/decision-center', label: 'Decision' },
      { path: '/admin/agents/findings', label: 'Candidates' },
      { path: '/admin/agents/contents', label: 'Scanned' },
      { path: '/admin/agents/spam', label: 'Spam' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    path: '/admin/agents/lead-center',
    match: p => p.startsWith('/admin/agents/lead-center'),
    subnav: [{ path: '/admin/agents/lead-center', label: 'Pipeline / Journey / Revenue' }],
  },
  {
    id: 'operations',
    label: 'Operations',
    path: '/admin/agents/runtime',
    match: p =>
      p.startsWith('/admin/agents/runtime') ||
      p.startsWith('/admin/agents/jobs') ||
      p.startsWith('/admin/agents/sources') ||
      p.startsWith('/admin/agents/missions') ||
      p.startsWith('/admin/agents/sessions') ||
      p.startsWith('/admin/agents/reports') ||
      p.startsWith('/admin/agents/notifications') ||
      p.startsWith('/admin/agents/ai-providers'),
    subnav: [
      { path: '/admin/agents/runtime', label: 'Runtime / Fleet' },
      { path: '/admin/agents/jobs', label: 'Jobs' },
      { path: '/admin/agents/sources', label: 'Sources' },
      { path: '/admin/agents/missions', label: 'Missions' },
      { path: '/admin/agents/sessions', label: 'Sessions' },
      { path: '/admin/agents/ai-providers', label: 'AI Providers' },
      { path: '/admin/agents/reports', label: 'Reports' },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    path: '/admin/agents/knowledge-center',
    match: p =>
      p.startsWith('/admin/agents/knowledge-center') ||
      p.startsWith('/admin/agents/knowledge-analytics') ||
      p.startsWith('/admin/agents/feedback-center'),
    subnav: [
      { path: '/admin/agents/knowledge-center', label: 'Concepts' },
      { path: '/admin/agents/knowledge-analytics', label: 'Analytics' },
      { path: '/admin/agents/feedback-center', label: 'Feedback' },
    ],
  },
];

type Props = {
  userRole: UserRole;
};

function resolveSection(pathname: string) {
  if (pathname === '/admin/agents' || pathname === '/admin/agents/') return 'dashboard';
  if (pathname.startsWith('/admin/agents/campaign-center')) return 'campaign-center';
  if (pathname.startsWith('/admin/agents/marketing-center')) return 'marketing-center';
  if (pathname.startsWith('/admin/agents/decision-center')) return 'decision-center';
  if (pathname.startsWith('/admin/agents/knowledge-center')) return 'knowledge-center';
  if (pathname.startsWith('/admin/agents/knowledge-analytics')) return 'knowledge-analytics';
  if (pathname.startsWith('/admin/agents/feedback-center')) return 'feedback-center';
  if (pathname.startsWith('/admin/agents/ai-providers')) return 'ai-providers';
  if (pathname.startsWith('/admin/agents/lead-center')) return 'lead-center';
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
  if (pathname.startsWith('/admin/agents/runtime')) return 'runtime';
  if (pathname.startsWith('/admin/agents/reports')) return 'reports';
  return 'dashboard';
}

function resolvePublishingSection(pathname: string) {
  if (pathname.includes('/publishing/drafts')) return 'publishing-drafts';
  if (pathname.includes('/publishing/channels')) return 'publishing-channels';
  if (pathname.includes('/publishing/history')) return 'publishing-history';
  if (pathname.includes('/publishing/campaigns')) return 'publishing-campaigns';
  if (pathname.startsWith('/admin/agents/publishing')) return 'publishing';
  return null;
}

function resolveHub(pathname: string) {
  return HUBS.find(h => h.match(pathname)) || HUBS[0];
}

export default function AgentPlatformPage({ userRole }: Props) {
  const location = useLocation();
  const section = resolveSection(location.pathname);
  const publishingSection = resolvePublishingSection(location.pathname);
  const hub = resolveHub(location.pathname);
  const canManage = userRole === 'owner' || userRole === 'company';

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-1">
        {HUBS.map(item => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.end}
            className={() => {
              const active = hub.id === item.id;
              return `whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200 border border-transparent'
              }`;
            }}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {hub.subnav.length > 0 ? (
        <nav className="flex gap-1 overflow-x-auto px-1">
          {hub.subnav.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                  isActive ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}

      <div className="min-h-0">
        {section === 'dashboard' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <ExecutiveDashboardPage />
          </Suspense>
        )}
        {section === 'campaign-center' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <CampaignCenterPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'marketing-center' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <MarketingCenterPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'decision-center' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <DecisionCenterPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'knowledge-center' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <KnowledgeCenterPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'knowledge-analytics' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <KnowledgeAnalyticsPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'feedback-center' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <FeedbackCenterPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'ai-providers' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <AiProvidersPage canManage={canManage} />
          </Suspense>
        )}
        {section === 'lead-center' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <LeadCenterPage canManage={canManage} />
          </Suspense>
        )}
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
            {publishingSection === 'publishing-drafts' && (
              <PublishingDraftsPage canManage={canManage} />
            )}
            {publishingSection === 'publishing-channels' && (
              <PublishingChannelsPage canManage={canManage} />
            )}
            {publishingSection === 'publishing-history' && (
              <PublishingHistoryPage canManage={canManage} />
            )}
            {publishingSection === 'publishing-campaigns' && (
              <PublishingCampaignsPage canManage={canManage} />
            )}
            {publishingSection === 'publishing' && (
              <PublishingSchedulePage canManage={canManage} />
            )}
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
        {section === 'runtime' && (
          <Suspense fallback={<AgentPanelLoader />}>
            <RuntimeMonitorPage />
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

export const AGENT_PLATFORM_PATHS = HUBS.map(item => item.path);
