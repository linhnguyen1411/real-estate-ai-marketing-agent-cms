import React, { useEffect, useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  FlaskConical,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Globe,
  Activity,
  X
} from 'lucide-react';
import type { AuthUser, CrawlerJob, CrawlerLog, CrawlerResult, CrawlerTestPreview } from './types';
import {
  createCrawlerJob,
  deleteCrawlerJob,
  getAuthToken,
  getCrawlerJobs,
  getCrawlerLogs,
  getCrawlerResults,
  getCurrentUser,
  runAllCrawlerJobs,
  runCrawlerJob,
  testCrawlerJob,
  updateCrawlerJob
} from './services/api';

const INTENT_LABELS: Record<string, string> = {
  buy: 'Mua',
  sell: 'Bán',
  rent: 'Thuê',
  lease: 'Cho thuê',
  unknown: 'Chưa rõ'
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  disabled: 'Tắt'
};

const emptyForm = {
  source_name: '',
  start_url: '',
  keyword: '',
  run_interval_minutes: 60,
  status: 'active' as CrawlerJob['status']
};

export default function CrawlerJobsPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [jobs, setJobs] = useState<CrawlerJob[]>([]);
  const [results, setResults] = useState<CrawlerResult[]>([]);
  const [logs, setLogs] = useState<CrawlerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filterJobId, setFilterJobId] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [testPreview, setTestPreview] = useState<CrawlerTestPreview | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async (jobId?: string) => {
    setLoading(true);
    try {
      const [jobList, resultList, logList] = await Promise.all([
        getCrawlerJobs(),
        getCrawlerResults(jobId || undefined),
        getCrawlerLogs(jobId || undefined)
      ]);
      setJobs(jobList);
      setResults(resultList);
      setLogs(logList);
    } catch (error: any) {
      showToast(error.message || 'Không tải được dữ liệu crawler', 'error');
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
        return loadData();
      })
      .catch(() => navigate('/admin/login'))
      .finally(() => setAuthLoading(false));
  }, [navigate]);

  useEffect(() => {
    if (!authLoading && currentUser) {
      loadData(filterJobId || undefined);
    }
  }, [filterJobId]);

  const handleCreateJob = async (e: FormEvent) => {
    e.preventDefault();
    setActionLoading('create');
    try {
      await createCrawlerJob(form);
      setForm(emptyForm);
      setShowForm(false);
      showToast('Đã tạo crawler job');
      await loadData(filterJobId || undefined);
    } catch (error: any) {
      showToast(error.message || 'Tạo job thất bại', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunJob = async (jobId: string) => {
    setActionLoading(`run-${jobId}`);
    try {
      const summary = await runCrawlerJob(jobId);
      showToast(summary.message);
      await loadData(filterJobId || undefined);
    } catch (error: any) {
      showToast(error.message || 'Chạy job thất bại', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTestJob = async (jobId: string) => {
    setActionLoading(`test-${jobId}`);
    try {
      const preview = await testCrawlerJob(jobId);
      setTestPreview(preview);
    } catch (error: any) {
      showToast(error.message || 'Test job thất bại', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunAll = async () => {
    setActionLoading('run-all');
    try {
      const summaries = await runAllCrawlerJobs();
      showToast(`Đã chạy ${summaries.length} job active`);
      await loadData(filterJobId || undefined);
    } catch (error: any) {
      showToast(error.message || 'Chạy tất cả job thất bại', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStatus = async (job: CrawlerJob) => {
    const nextStatus = job.status === 'active' ? 'paused' : 'active';
    setActionLoading(`toggle-${job.id}`);
    try {
      await updateCrawlerJob(job.id, { status: nextStatus });
      showToast(nextStatus === 'active' ? 'Job đã bật' : 'Job đã tạm dừng');
      await loadData(filterJobId || undefined);
    } catch (error: any) {
      showToast(error.message || 'Cập nhật job thất bại', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!window.confirm('Xóa crawler job này?')) return;
    setActionLoading(`delete-${jobId}`);
    try {
      await deleteCrawlerJob(jobId);
      showToast('Đã xóa job');
      await loadData(filterJobId || undefined);
    } catch (error: any) {
      showToast(error.message || 'Xóa job thất bại', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-slate-950 text-slate-100 app-scroll">
      <header className="border-b border-slate-900 bg-slate-950/90 backdrop-blur px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/dashboard" className="p-2 rounded-lg border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase tracking-wider">
                <Globe className="w-3.5 h-3.5" />
                Crawler public sources — experimental
              </div>
              <h1 className="text-xl font-bold text-white">Crawler Jobs (Public)</h1>
              <p className="text-xs text-slate-400 mt-1">Thử nghiệm quét nguồn public. Lead thực tế: dùng Chrome Extension hoặc Import Lead.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/crawler-health"
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-800 hover:border-amber-500/40 flex items-center gap-2"
            >
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              Health
            </Link>
            <button
              onClick={() => loadData(filterJobId || undefined)}
              disabled={loading}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-800 hover:border-slate-700 flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
            {currentUser?.role === 'owner' && (
              <button
                onClick={handleRunAll}
                disabled={actionLoading === 'run-all'}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                Chạy tất cả active
              </button>
            )}
            <button
              onClick={() => setShowForm(v => !v)}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm job
            </button>
          </div>
        </div>
      </header>

      {testPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <h3 className="font-bold text-white">Preview Run Test (dry-run)</h3>
                <p className="text-xs text-slate-400">1 trang — không lưu lead thật</p>
              </div>
              <button onClick={() => setTestPreview(null)} className="p-2 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm max-h-[70vh] overflow-y-auto">
              <div><span className="text-slate-500">URL:</span> <span className="text-rose-300 break-all">{testPreview.source_url || '—'}</span></div>
              <div><span className="text-slate-500">Title:</span> <span className="text-white">{testPreview.title || '—'}</span></div>
              <div><span className="text-slate-500">Phone:</span> <span className="text-emerald-300">{testPreview.phone || '—'}</span></div>
              <div><span className="text-slate-500">Intent:</span> <span className="text-white">{INTENT_LABELS[testPreview.intent] || testPreview.intent}</span></div>
              <div><span className="text-slate-500">Would save lead:</span> <span className={testPreview.would_save ? 'text-emerald-400' : 'text-slate-400'}>{testPreview.would_save ? 'Có' : 'Không'}</span></div>
              <div>
                <span className="text-slate-500 block mb-1">Text preview:</span>
                <p className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-xs leading-6 text-slate-300 whitespace-pre-wrap">{testPreview.text || '—'}</p>
              </div>
              {testPreview.errors?.length > 0 && (
                <div className="text-xs text-amber-300">{testPreview.errors.join(' | ')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border text-sm shadow-xl ${
          toast.type === 'error' ? 'bg-rose-950 border-rose-500/40 text-rose-100' : 'bg-emerald-950 border-emerald-500/40 text-emerald-100'
        }`}>
          {toast.message}
        </div>
      )}

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {showForm && (
          <form onSubmit={handleCreateJob} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-6 grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">Tên nguồn (source_name)</span>
              <input required value={form.source_name} onChange={e => setForm({ ...form, source_name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" placeholder="VD: Batdongsan public" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">Keyword tìm kiếm</span>
              <input value={form.keyword} onChange={e => setForm({ ...form, keyword: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" placeholder="VD: mua nhà đà nẵng" />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-slate-400">URL bắt đầu (start_url) — HTML public hoặc RSS</span>
              <input value={form.start_url} onChange={e => setForm({ ...form, start_url: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" placeholder="https://example.com/feed.xml" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">Interval (phút)</span>
              <input type="number" min={5} value={form.run_interval_minutes}
                onChange={e => setForm({ ...form, run_interval_minutes: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">Trạng thái</span>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as CrawlerJob['status'] })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-xl border border-slate-800">Hủy</button>
              <button type="submit" disabled={actionLoading === 'create'} className="px-4 py-2 text-sm rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50">
                Lưu job
              </button>
            </div>
          </form>
        )}

        <section className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2"><Bot className="w-4 h-4 text-rose-400" /> Crawler Jobs</h2>
            <span className="text-xs text-slate-500">{jobs.length} job</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-slate-950/60">
                <tr>
                  <th className="text-left py-3 px-4">Nguồn</th>
                  <th className="text-left py-3 px-4">Keyword</th>
                  <th className="text-left py-3 px-4">Interval</th>
                  <th className="text-left py-3 px-4">Trạng thái</th>
                  <th className="text-left py-3 px-4">Lần chạy cuối</th>
                  <th className="text-right py-3 px-4">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id} className="border-t border-slate-900 hover:bg-slate-900/40">
                    <td className="py-3 px-4">
                      <div className="font-medium text-white">{job.source_name}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[220px]">{job.start_url || '—'}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{job.keyword || '—'}</td>
                    <td className="py-3 px-4">{job.run_interval_minutes} phút</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-1 rounded-full border ${
                        job.status === 'active' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-slate-700 text-slate-400'
                      }`}>
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400">
                      {job.last_run_at ? new Date(job.last_run_at).toLocaleString('vi-VN') : 'Chưa chạy'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <button
                          onClick={() => handleTestJob(job.id)}
                          disabled={actionLoading === `test-${job.id}`}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-sky-600/20 border border-sky-500/30 text-sky-300 hover:bg-sky-600/30 flex items-center gap-1"
                        >
                          <FlaskConical className="w-3 h-3" /> Run test
                        </button>
                        <button
                          onClick={() => handleRunJob(job.id)}
                          disabled={actionLoading === `run-${job.id}`}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" /> Chạy ngay
                        </button>
                        <button
                          onClick={() => handleToggleStatus(job)}
                          disabled={actionLoading === `toggle-${job.id}`}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 hover:border-slate-600"
                        >
                          {job.status === 'active' ? 'Pause' : 'Bật'}
                        </button>
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          disabled={actionLoading === `delete-${job.id}`}
                          className="p-1.5 rounded-lg border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!jobs.length && (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-500">Chưa có crawler job. Thêm job để bắt đầu.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="font-bold flex items-center gap-2"><Search className="w-4 h-4 text-rose-400" /> Kết quả Crawler</h2>
            <select
              value={filterJobId}
              onChange={e => setFilterJobId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs"
            >
              <option value="">Tất cả job</option>
              {jobs.map(job => <option key={job.id} value={job.id}>{job.source_name}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-slate-950/60">
                <tr>
                  <th className="text-left py-3 px-4">Tiêu đề</th>
                  <th className="text-left py-3 px-4">SĐT</th>
                  <th className="text-left py-3 px-4">Intent</th>
                  <th className="text-left py-3 px-4">Nguồn URL</th>
                  <th className="text-left py-3 px-4">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {results.map(item => (
                  <tr key={item.id} className="border-t border-slate-900 hover:bg-slate-900/40">
                    <td className="py-3 px-4">
                      <div className="font-medium text-white line-clamp-1">{item.title || 'Không tiêu đề'}</div>
                      <div className="text-xs text-slate-500 line-clamp-2">{item.text.slice(0, 120)}</div>
                    </td>
                    <td className="py-3 px-4 text-emerald-300">{item.phone || '—'}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-950 border border-slate-800">
                        {INTENT_LABELS[item.intent] || item.intent}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <a href={item.source_url} target="_blank" rel="noreferrer" className="text-xs text-rose-400 hover:underline inline-flex items-center gap-1 max-w-[200px] truncate">
                        {item.source_url} <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
                {!results.length && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa có kết quả crawler.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="font-bold">Log gần đây</h2>
          </div>
          <div className="divide-y divide-slate-900">
            {logs.slice(0, 10).map(log => (
              <div key={log.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mb-1">
                  <span>{new Date(log.created_at).toLocaleString('vi-VN')}</span>
                  <span className="text-emerald-400">{log.new_leads} lead mới</span>
                  <span>{log.pages_scanned} trang</span>
                  <span className="text-amber-400">{log.duplicates} trùng</span>
                </div>
                <p className="text-slate-200">{log.message}</p>
                {log.errors?.length > 0 && (
                  <p className="text-xs text-rose-400 mt-1">{log.errors.join(' | ')}</p>
                )}
              </div>
            ))}
            {!logs.length && <div className="px-4 py-8 text-center text-slate-500 text-sm">Chưa có log.</div>}
          </div>
        </section>
      </main>
    </div>
  );
}
