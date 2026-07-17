import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const TABS = [
  { id: 'schedule', label: 'Lịch đăng', path: '/admin/agents/publishing' },
  { id: 'drafts', label: 'Bản nháp', path: '/admin/agents/publishing/drafts' },
  { id: 'channels', label: 'Kênh đăng', path: '/admin/agents/publishing/channels' },
  { id: 'history', label: 'Lịch sử đăng', path: '/admin/agents/publishing/history' },
  { id: 'campaigns', label: 'Campaign', path: '/admin/agents/publishing/campaigns' },
] as const;

export type PublishingNavId = (typeof TABS)[number]['id'];

type Props = {
  title: string;
  subtitle: string;
  active: PublishingNavId;
  message?: string;
};

export default function PublishingSubnav({ title, subtitle, active, message }: Props) {
  const location = useLocation();

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-1">
          {TABS.map(item => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.id === 'schedule'}
              className={() =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors border ${
                  active === item.id
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200 border-transparent'
                }`
              }
              onClick={e => {
                if (location.pathname === item.path) {
                  e.preventDefault();
                }
              }}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      {message ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      ) : null}
    </div>
  );
}
