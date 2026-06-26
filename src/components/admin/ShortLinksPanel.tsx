import React, { useEffect, useState } from 'react';
import { BarChart3, Copy, Link2, Plus, QrCode, Trash2 } from 'lucide-react';
import {
  createShortLink,
  deleteShortLink,
  fetchShortLinkAnalytics,
  fetchShortLinks,
  getQrCodeUrl,
  updateShortLink,
} from '../../services/shortLinksApi';
import type { ShortLink, ShortLinkAnalytics } from '../../types/shortLink';

const EMPTY_FORM = {
  slug: '',
  target_url: '',
  title: '',
  entity_type: 'custom',
  campaign: '',
  is_active: true,
};

export default function ShortLinksPanel() {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [analytics, setAnalytics] = useState<ShortLinkAnalytics | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    setMessage('');
    fetchShortLinks()
      .then(setLinks)
      .catch(err => {
        setLinks([]);
        setMessage(err instanceof Error ? err.message : 'Không tải được short links.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.target_url.trim()) return;
    await createShortLink(form);
    setForm(EMPTY_FORM);
    setMessage('Đã tạo short link.');
    load();
  };

  const toggleActive = async (link: ShortLink) => {
    await updateShortLink(link.id, { is_active: !link.is_active });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa short link này?')) return;
    await deleteShortLink(id);
    load();
  };

  const openAnalytics = async (id: string) => {
    setSelectedId(id);
    setAnalytics(null);
    setAnalyticsError('');
    setAnalyticsLoading(true);
    try {
      const data = await fetchShortLinkAnalytics(id);
      setAnalytics(data);
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : 'Không tải được analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const closeAnalytics = () => {
    setSelectedId(null);
    setAnalytics(null);
    setAnalyticsError('');
  };

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setMessage('Đã copy link.');
  };

  if (loading) {
    return <div className="p-6 text-slate-400">Đang tải short links...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Short Links</h2>
          <p className="text-xs text-slate-500">Quản lý link ngắn /s/slug — theo dõi click và nguồn khách</p>
        </div>
        <button type="button" onClick={load} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white">
          Làm mới
        </button>
      </div>

      {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{message}</div>}

      <form onSubmit={handleCreate} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:grid-cols-2">
        <input
          value={form.slug}
          onChange={e => setForm(prev => ({ ...prev, slug: e.target.value }))}
          placeholder="Slug (vd: mdc650)"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <input
          value={form.target_url}
          onChange={e => setForm(prev => ({ ...prev, target_url: e.target.value }))}
          placeholder="Target URL"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2"
        />
        <input
          value={form.title}
          onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
          placeholder="Tiêu đề"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <input
          value={form.campaign}
          onChange={e => setForm(prev => ({ ...prev, campaign: e.target.value }))}
          placeholder="Campaign"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white md:col-span-2">
          <Plus className="h-4 w-4" />
          Tạo short link
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Click</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {links.map(link => (
              <tr key={link.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                <td className="px-4 py-3 font-mono text-rose-300">/s/{link.slug}</td>
                <td className="max-w-xs px-4 py-3 text-slate-300">
                  <div className="truncate text-xs">{link.title || '—'}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{link.target_url}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {link.entity_type || 'custom'}
                  {link.entity_id ? ` · ${link.entity_id}` : ''}
                </td>
                <td className="px-4 py-3 text-white">{link.click_count || 0}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => toggleActive(link)} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${link.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                    {link.is_active ? 'Bật' : 'Tắt'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => copyLink(link.short_url || '')} className="rounded bg-slate-800 p-2 text-slate-300 hover:text-white" title="Copy">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <a href={getQrCodeUrl(link.short_url || '')} target="_blank" rel="noreferrer" className="rounded bg-slate-800 p-2 text-slate-300 hover:text-white" title="QR">
                      <QrCode className="h-3.5 w-3.5" />
                    </a>
                    <button type="button" onClick={() => openAnalytics(link.id)} className="rounded bg-slate-800 p-2 text-slate-300 hover:text-white" title="Analytics">
                      <BarChart3 className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(link.id)} className="rounded bg-slate-800 p-2 text-rose-300 hover:text-rose-200" title="Xóa">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <h3 className="font-bold text-white">Analytics · /s/{links.find(item => item.id === selectedId)?.slug}</h3>
                <p className="text-xs text-slate-500">{links.find(item => item.id === selectedId)?.short_url}</p>
              </div>
              <button type="button" onClick={closeAnalytics} className="rounded-lg px-3 py-1 text-xs text-slate-400 hover:bg-slate-900">
                Đóng
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 app-scroll">
              {analyticsLoading && (
                <p className="py-8 text-center text-sm text-slate-400">Đang tải thống kê...</p>
              )}
              {analyticsError && (
                <p className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">{analyticsError}</p>
              )}
              {analytics && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg bg-slate-900 p-3">
                      <div className="text-xs text-slate-500">Tổng click</div>
                      <div className="text-2xl font-bold text-white">{analytics.total_clicks}</div>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-3">
                      <div className="text-xs text-slate-500">Thiết bị unique</div>
                      <div className="text-2xl font-bold text-white">{analytics.unique_devices}</div>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-3">
                      <div className="text-xs text-slate-500">Top browser</div>
                      <div className="text-lg font-bold text-white">
                        {Object.entries(analytics.by_browser).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-3">
                      <div className="text-xs text-slate-500">Top referrer</div>
                      <div className="text-lg font-bold text-white">
                        {Object.entries(analytics.by_referer).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-800 p-3">
                      <div className="mb-2 text-xs font-bold uppercase text-slate-500">Thiết bị</div>
                      {Object.entries(analytics.by_device)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm text-slate-300">
                            <span>{k}</span>
                            <span className="font-bold text-white">{v}</span>
                          </div>
                        ))}
                    </div>
                    <div className="rounded-lg border border-slate-800 p-3">
                      <div className="mb-2 text-xs font-bold uppercase text-slate-500">Browser</div>
                      {Object.entries(analytics.by_browser)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm text-slate-300">
                            <span>{k}</span>
                            <span className="font-bold text-white">{v}</span>
                          </div>
                        ))}
                    </div>
                    <div className="rounded-lg border border-slate-800 p-3">
                      <div className="mb-2 text-xs font-bold uppercase text-slate-500">Referrer</div>
                      {Object.entries(analytics.by_referer)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-2 text-sm text-slate-300">
                            <span className="truncate">{k}</span>
                            <span className="shrink-0 font-bold text-white">{v}</span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h4 className="mb-3 text-sm font-bold text-white">
                      Lịch sử click gần đây ({analytics.recent_clicks.length}
                      {analytics.total_clicks > analytics.recent_clicks.length
                        ? ` / ${analytics.total_clicks} tổng`
                        : ''}
                      )
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full min-w-[720px] text-left text-xs">
                        <thead className="bg-slate-900 text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Thời gian</th>
                            <th className="px-3 py-2">Thiết bị</th>
                            <th className="px-3 py-2">Browser</th>
                            <th className="px-3 py-2">OS</th>
                            <th className="px-3 py-2">Referrer</th>
                            <th className="px-3 py-2">UTM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.recent_clicks.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                                Chưa có click nào được ghi nhận.
                              </td>
                            </tr>
                          ) : (
                            analytics.recent_clicks.map(click => (
                              <tr key={click.id} className="border-t border-slate-800 text-slate-300">
                                <td className="whitespace-nowrap px-3 py-2">
                                  {new Date(click.clicked_at).toLocaleString('vi-VN')}
                                </td>
                                <td className="px-3 py-2">{click.device || '—'}</td>
                                <td className="px-3 py-2">{click.browser || '—'}</td>
                                <td className="px-3 py-2">{click.os || '—'}</td>
                                <td className="max-w-[180px] truncate px-3 py-2" title={click.referer || ''}>
                                  {click.referer || 'direct'}
                                </td>
                                <td className="px-3 py-2">
                                  {[click.utm_source, click.utm_medium, click.utm_campaign].filter(Boolean).join(' / ') || '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {links.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
          <Link2 className="mx-auto mb-2 h-6 w-6" />
          Chưa có short link. Link sẽ tự tạo khi share BĐS hoặc bài viết.
        </div>
      )}
    </div>
  );
}
