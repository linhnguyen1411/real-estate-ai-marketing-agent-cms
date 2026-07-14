import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Monitor, RefreshCw } from 'lucide-react';
import { fetchAgentSessions } from '../../../../services/agentPlatformApi';
import type { BrowserSession } from '../../../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

const STALE_HEARTBEAT_MS = 45_000;

function sessionHealth(session: BrowserSession): 'online' | 'stale' | 'offline' | 'needs_login' {
  if (session.status === 'needs_login') return 'needs_login';
  if (session.status === 'offline') return 'offline';
  if (!session.lastHeartbeatAt) return 'offline';
  const age = Date.now() - new Date(session.lastHeartbeatAt).getTime();
  if (age > STALE_HEARTBEAT_MS) return 'stale';
  return 'online';
}

const HEALTH_LABEL: Record<ReturnType<typeof sessionHealth>, string> = {
  online: 'Online',
  stale: 'Heartbeat cũ',
  offline: 'Offline',
  needs_login: 'Cần đăng nhập',
};

const HEALTH_CLASS: Record<ReturnType<typeof sessionHealth>, string> = {
  online: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  stale: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  offline: 'bg-slate-700/40 text-slate-400 border-slate-700',
  needs_login: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export default function BrowserSessions() {
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await fetchAgentSessions({ page: 1, limit: 50 });
      setSessions(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được sessions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading && sessions.length === 0) {
    return <AgentPanelLoader label="Đang tải browser sessions..." />;
  }

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Browser Sessions"
        subtitle="Worker Playwright đăng ký heartbeat qua PostgreSQL — không chạy trong web server"
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      {error && sessions.length === 0 && (
        <AgentPanelError message={error} onRetry={() => load()} />
      )}

      {!error && sessions.length === 0 && (
        <AgentPanelEmpty
          title="Chưa có Browser Worker"
          description="Chạy npm run agent:install-browser rồi npm run agent:worker trên máy có Chromium. Session sẽ xuất hiện khi worker heartbeat."
        />
      )}

      {sessions.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Tên</th>
                <th className="px-4 py-3 font-semibold">Worker</th>
                <th className="px-4 py-3 font-semibold">Trạng thái</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">Profile</th>
                <th className="px-4 py-3 font-semibold hidden lg:table-cell">URL hiện tại</th>
                <th className="px-4 py-3 font-semibold">Heartbeat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {sessions.map(session => {
                const health = sessionHealth(session);
                return (
                  <tr key={session.id} className="bg-slate-950/40 hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-200">
                        <Monitor className="h-4 w-4 shrink-0 text-slate-500" />
                        {session.name}
                      </div>
                      {session.lastError && (
                        <p className="mt-1 text-xs text-rose-400/90 line-clamp-2">{session.lastError}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {session.workerId || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${HEALTH_CLASS[health]}`}
                      >
                        {HEALTH_LABEL[health]}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-slate-500 max-w-[200px] truncate">
                      {session.profilePath}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell max-w-[220px]">
                      {session.currentUrl ? (
                        <a
                          href={session.currentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 truncate max-w-full"
                        >
                          <span className="truncate">{session.currentUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {session.lastHeartbeatAt ? formatAgentDate(session.lastHeartbeatAt) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sessions.length > 0 && (
        <p className="text-xs text-slate-600 flex items-center gap-1">
          <RefreshCw className="h-3 w-3" />
          Tự làm mới mỗi 20 giây. Heartbeat worker mặc định 15–30 giây.
        </p>
      )}
    </div>
  );
}
