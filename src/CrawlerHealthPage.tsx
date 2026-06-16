import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Clock,
  Globe,
  RefreshCw,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import type { AuthUser, CrawlerHealthData } from './types';
import { getAuthToken, getCrawlerHealth, getCurrentUser } from './services/api';

export default function CrawlerHealthPage() {
  const navigate = useNavigate();
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [health, setHealth] = useState<CrawlerHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHealth = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getCrawlerHealth();
      setHealth(data);
    } catch (err: any) {
      setError(err.message || 'Không tải được crawler health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      navigate('/admin/login');
      return;
    }
    getCurrentUser()
      .then(user => {
        setCurrentUser(user);
        return loadHealth();
      })
      .catch(() => navigate('/admin/login'))
      .finally(() => setAuthLoading(false));
  }, [navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  const cards = health ? [
    { label: 'Job active', value: health.active_jobs, sub: `/ ${health.total_jobs} tổng`, icon: Activity, color: 'text-emerald-400' },
    { label: 'Lead mới hôm nay', value: health.new_leads_today, icon: Sparkles, color: 'text-sky-400' },
    { label: 'Lỗi hôm nay', value: health.errors_today, icon: AlertTriangle, color: 'text-amber-400' },
    {
      label: 'Lần chạy gần nhất',
      value: health.last_run_at ? new Date(health.last_run_at).toLocaleString('vi-VN') : 'Chưa chạy',
      icon: Clock,
      color: 'text-rose-400',
      isText: true
    }
  ] : [];

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-slate-950 text-slate-100 app-scroll">
      <header className="border-b border-slate-900 bg-slate-950/90 backdrop-blur px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/crawler-jobs" className="p-2 rounded-lg border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider">
                <Globe className="w-3.5 h-3.5" />
                Crawler Health
              </div>
              <h1 className="text-xl font-bold text-white">Kiểm tra sức khỏe Crawler</h1>
              <p className="text-xs text-slate-400 mt-1">Theo dõi job active, lead, lỗi và nguồn bị chặn/captcha.</p>
            </div>
          </div>
          <button
            onClick={loadHealth}
            disabled={loading}
            className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-800 hover:border-slate-700 flex items-center gap-2 self-start"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 mb-2">
                  <Icon className={`w-4 h-4 ${card.color}`} />
                  {card.label}
                </div>
                <div className={`font-bold ${card.isText ? 'text-sm leading-6 text-slate-200' : 'text-3xl text-white'}`}>
                  {card.value}
                  {!card.isText && card.sub && <span className="text-sm text-slate-500 ml-2">{card.sub}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <h2 className="font-bold">Job bị captcha / block nhiều (hôm nay)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-slate-950/60">
                <tr>
                  <th className="text-left py-3 px-4">Nguồn</th>
                  <th className="text-left py-3 px-4">Số lần block</th>
                  <th className="text-left py-3 px-4">Lỗi gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {health?.blocked_jobs.map(item => (
                  <tr key={item.job_id} className="border-t border-slate-900">
                    <td className="py-3 px-4 font-medium text-white">{item.source_name}</td>
                    <td className="py-3 px-4 text-amber-400">{item.block_count}</td>
                    <td className="py-3 px-4 text-xs text-slate-400 max-w-xl">{item.last_error || '—'}</td>
                  </tr>
                ))}
                {!health?.blocked_jobs.length && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-500">
                      {loading ? 'Đang tải...' : 'Không có job bị captcha/block hôm nay.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link to="/admin/crawler-jobs" className="text-rose-400 hover:underline">← Quay lại Crawler Jobs</Link>
          {currentUser && <span className="text-slate-600">|</span>}
          {currentUser && <span className="text-slate-500">Đăng nhập: {currentUser.email}</span>}
        </div>
      </main>
    </div>
  );
}
