import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  fetchAgentNotifications,
  fetchAgentNotificationUnreadCount,
  markAgentNotificationRead,
  markAllAgentNotificationsRead,
} from '../../services/agentPlatformApi';
import type { AgentNotification } from '../../types/agentPlatform';
import { resolveAgentNotificationHref } from '../../utils/agentNotificationLinks';
import { formatAgentDate } from './AgentPlatformUi';

const POLL_MS = 45_000;

export default function AgentNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AgentNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const data = await fetchAgentNotificationUnreadCount();
      setUnread(data.unread);
    } catch {
      /* ignore poll errors */
    }
  }, []);

  const loadRecent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAgentNotifications({ page: 1, limit: 10 });
      setItems(res.data);
      await refreshUnread();
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [refreshUnread]);

  useEffect(() => {
    refreshUnread();
    const timer = setInterval(refreshUnread, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshUnread]);

  useEffect(() => {
    if (!open) return;
    loadRecent();
  }, [open, loadRecent]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const openItem = async (item: AgentNotification) => {
    if (item.status === 'unread') {
      try {
        await markAgentNotificationRead(item.id);
        setUnread(prev => Math.max(0, prev - 1));
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    navigate(resolveAgentNotificationHref(item.data));
  };

  const markAll = async () => {
    try {
      await markAllAgentNotificationsRead();
      setUnread(0);
      setItems(prev => prev.map(item => ({ ...item, status: 'read' })));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="relative p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all"
        aria-label="Thông báo AI Agent"
        title="Thông báo AI Agent"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(100vw-1.5rem,22rem)] rounded-xl border border-slate-800 bg-slate-950 shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-900">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
              Thông báo Agent
            </span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                >
                  Đọc hết
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/admin/agents/notifications');
                }}
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                Xem tất cả
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto app-scroll">
            {loading && items.length === 0 ? (
              <p className="p-4 text-xs text-slate-500">Đang tải…</p>
            ) : items.length === 0 ? (
              <p className="p-4 text-xs text-slate-500">Chưa có thông báo.</p>
            ) : (
              <ul>
                {items.map(item => (
                  <li key={item.id} className="border-t border-slate-900/80 first:border-t-0">
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-slate-900/70 transition-colors ${
                        item.status === 'unread' ? 'bg-rose-950/20' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-xs leading-snug ${item.status === 'unread' ? 'text-white font-semibold' : 'text-slate-300'}`}>
                          {item.title}
                        </p>
                        {item.status === 'unread' && (
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">{item.message}</p>
                      <p className="mt-1 text-[10px] text-slate-600">
                        {item.type} · {formatAgentDate(item.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
