import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import DraftsPanel from '../components/DraftsPanel';
import CalendarQueuePanel from '../components/CalendarQueuePanel';
import ChannelsPanel from '../components/ChannelsPanel';
import HistoryPanel from '../components/HistoryPanel';

export type PublishingTab = 'calendar' | 'drafts' | 'channels' | 'history';

const TABS: { id: PublishingTab; label: string; path: string }[] = [
  { id: 'calendar', label: 'Lịch đăng', path: '/admin/agents/publishing' },
  { id: 'drafts', label: 'Bản nháp', path: '/admin/agents/publishing/drafts' },
  { id: 'channels', label: 'Kênh đăng', path: '/admin/agents/publishing/channels' },
  { id: 'history', label: 'Logs', path: '/admin/agents/publishing/history' },
];

function resolvePublishingTab(pathname: string, hash: string): PublishingTab {
  if (pathname.endsWith('/drafts') || hash === '#drafts') return 'drafts';
  if (pathname.endsWith('/channels') || hash === '#channels') return 'channels';
  if (pathname.endsWith('/history') || hash === '#history') return 'history';
  if (hash === '#calendar' || hash === '#queue') return 'calendar';
  return 'calendar';
}

type Props = { canManage: boolean };

export default function SocialPublishingPage({ canManage }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = useMemo(
    () => resolvePublishingTab(location.pathname, location.hash),
    [location.pathname, location.hash],
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMessage('');
  }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Social Publishing</h2>
          <p className="text-xs text-slate-500">
            Lịch đăng bài Facebook — duyệt bản nháp trước khi đăng (không auto-approve).
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-1">
          {TABS.map(item => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.id === 'calendar'}
              className={() =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors border ${
                  tab === item.id
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200 border-transparent'
                }`
              }
              onClick={e => {
                // Keep sidebar deep-links working even if already on publishing host
                if (location.pathname === item.path) {
                  e.preventDefault();
                  navigate(item.path, { replace: true });
                }
              }}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {message && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}

      {tab === 'drafts' && (
        <DraftsPanel canManage={canManage} onMessage={setMessage} />
      )}
      {tab === 'calendar' && (
        <CalendarQueuePanel canManage={canManage} onMessage={setMessage} />
      )}
      {tab === 'channels' && (
        <ChannelsPanel canManage={canManage} onMessage={setMessage} />
      )}
      {tab === 'history' && (
        <HistoryPanel canManage={canManage} onMessage={setMessage} />
      )}
    </div>
  );
}
