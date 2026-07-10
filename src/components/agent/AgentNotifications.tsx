import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchAgentNotifications,
  markAgentNotificationRead,
} from '../../services/agentPlatformApi';
import type { AgentNotification } from '../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from './AgentPlatformUi';

export default function AgentNotifications() {
  const [items, setItems] = useState<AgentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAgentNotifications({
        page: 1,
        limit: 50,
        status: filter || undefined,
      });
      setItems(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được thông báo.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (item: AgentNotification) => {
    if (item.status === 'read') return;
    await markAgentNotificationRead(item.id);
    load();
  };

  if (loading && items.length === 0) return <AgentPanelLoader label="Đang tải thông báo..." />;
  if (error && items.length === 0) return <AgentPanelError message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Thông báo Agent"
        onRefresh={load}
        refreshing={loading}
        actions={
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="">Tất cả</option>
            <option value="unread">Chưa đọc</option>
            <option value="read">Đã đọc</option>
            <option value="archived">Archived</option>
          </select>
        }
      />

      {items.length === 0 ? (
        <AgentPanelEmpty title="Không có thông báo" description="Hệ thống sẽ thông báo khi có finding hoặc lỗi job." />
      ) : (
        <ul className="space-y-2">
          {items.map(item => (
            <li
              key={item.id}
              className={`rounded-xl border p-4 ${
                item.status === 'unread'
                  ? 'border-rose-900/40 bg-rose-950/10'
                  : 'border-slate-800 bg-slate-900/20'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded px-2 py-0.5 font-bold uppercase ${
                      item.severity === 'error' || item.severity === 'critical'
                        ? 'bg-rose-900/50 text-rose-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {item.severity}
                    </span>
                    <span className="text-slate-600">{item.type}</span>
                    <span className="text-slate-600">{formatAgentDate(item.createdAt)}</span>
                  </div>
                  <h3 className="mt-1 font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{item.message}</p>
                  {item.finding && (
                    <p className="mt-1 text-xs text-slate-500">
                      Finding: {item.finding.title} (score {item.finding.score})
                    </p>
                  )}
                </div>
                {item.status === 'unread' && (
                  <button
                    type="button"
                    onClick={() => markRead(item)}
                    className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200"
                  >
                    Đánh dấu đã đọc
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
