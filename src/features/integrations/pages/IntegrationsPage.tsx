import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { getChannels } from '../../../services/api';
import type { MarketingChannel } from '../../../types';

type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;

type Props = { onNotify?: Notify };

export default function IntegrationsPage({ onNotify }: Props) {
  const [channels, setChannels] = useState<MarketingChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getChannels();
        if (!cancelled) setChannels(data);
      } catch (e) {
        if (!cancelled) {
          setChannels([]);
          onNotify?.(e instanceof Error ? e.message : 'Không tải kênh tích hợp.', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onNotify]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Đang tải tích hợp…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          Tích hợp kênh mạng xã hội & Tài khoản CMS
        </h2>
        <p className="text-slate-400 text-sm">Kiểm soát trạng thái kết nối cổng API của các fanpage và tài khoản liên kết.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {channels.map((chan, idx) => (
          <div
            key={idx}
            className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between hover:border-slate-800 transition-all space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    chan.platform === 'facebook'
                      ? 'bg-blue-600 text-white'
                      : chan.platform === 'zalo'
                        ? 'bg-sky-500 text-white'
                        : chan.platform === 'tiktok'
                          ? 'bg-white text-black'
                          : 'bg-rose-600 text-white'
                  }`}
                >
                  {chan.platform[0].toUpperCase()}
                </span>
                <div>
                  <h3 className="font-bold text-white text-xs leading-none">{chan.name}</h3>
                  <span className="text-3xs text-slate-500 capitalize">{chan.platform} API Client</span>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-3xs font-black tracking-tight ${
                  chan.connected
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-slate-950 text-slate-500 border-transparent'
                }`}
              >
                {chan.connected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            {chan.connected && (
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-900 text-center text-xs">
                <div>
                  <span className="block text-3xs text-slate-505">Tin nhắn nhận</span>
                  <span className="font-bold text-white">{chan.messages_count} messages</span>
                </div>
                <div>
                  <span className="block text-3xs text-slate-505">Bình luận</span>
                  <span className="font-bold text-white">{chan.comments_count} comments</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-3xs text-slate-500">
              <span>Quét lần cuối: {chan.last_sync}</span>
              <button type="button" className="text-rose-400 hover:underline">
                Đã lưu cổng
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/20 p-5 rounded-2xl border border-slate-900 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500" /> Hướng dẫn tích hợp cổng API thật (Prod Sync)
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
          Các thẻ kênh bên trên là mock demo sandbox — chưa phải kênh đăng bài thật. Outbound social publishing
          dùng module mới (`/api/social/*`). Để đấu nối Facebook Graph API, Zalo OA Webhook hay TikTok Marketing,
          bạn chỉ cần phát sinh cổng redirect OAuth, cấu hình Access Token gối đầu của doanh nghiệp trong trang
          Cài đặt, và hướng sự kiện webhook về địa chỉ của API Server.
        </p>
      </div>
    </div>
  );
}
