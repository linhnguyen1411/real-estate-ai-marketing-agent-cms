import React, { useCallback, useEffect, useState } from 'react';
import { Pause, Play, Plus, ScanLine } from 'lucide-react';
import {
  createAgentSource,
  deleteAgentSource,
  enqueueSourceScan,
  fetchAgentSources,
  updateAgentSource,
} from '../../services/agentPlatformApi';
import type { AgentSource } from '../../types/agentPlatform';
import {
  AGENT_SOURCE_TYPE_OPTIONS,
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from './AgentPlatformUi';

const EMPTY_FORM = {
  name: '',
  type: 'facebook_group',
  url: '',
  priority: 5,
  scanIntervalMinutes: 60,
};

type Props = { canManage: boolean };

export default function AgentSources({ canManage }: Props) {
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<AgentSource | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAgentSources({ page: 1, limit: 100 });
      setSources(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được nguồn.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    setMessage('');
    try {
      if (editing) {
        await updateAgentSource(editing.id, form);
        setMessage('Đã cập nhật nguồn.');
      } else {
        await createAgentSource(form);
        setMessage('Đã tạo nguồn.');
      }
      resetForm();
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lưu thất bại.');
    }
  };

  const togglePause = async (source: AgentSource) => {
    if (!canManage) return;
    setBusyId(source.id);
    try {
      await updateAgentSource(source.id, {
        status: source.status === 'active' ? 'paused' : 'active',
      });
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không đổi trạng thái.');
    } finally {
      setBusyId(null);
    }
  };

  const handleScan = async (source: AgentSource) => {
    if (!canManage) return;
    setBusyId(source.id);
    setMessage('');
    try {
      const result = await enqueueSourceScan(source);
      setMessage(`Đã enqueue job quét #${result.jobId.slice(0, 8)}… (chờ worker).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không tạo job quét.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (source: AgentSource) => {
    if (!canManage || !window.confirm(`Xóa hoặc tạm dừng nguồn "${source.name}"?`)) return;
    setBusyId(source.id);
    try {
      await deleteAgentSource(source.id);
      load();
      setMessage('Đã xử lý xóa nguồn.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Xóa thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <AgentPanelLoader label="Đang tải nguồn..." />;
  if (error) return <AgentPanelError message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Nguồn quét (Sources)"
        subtitle="Facebook group, website, forum — checkpoint chống trùng"
        onRefresh={load}
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => { setShowForm(true); setEditing(null); setForm(EMPTY_FORM); }}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm nguồn
            </button>
          ) : undefined
        }
      />

      {message && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}

      {showForm && canManage && (
        <form onSubmit={handleSubmit} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:grid-cols-2">
          <input
            required
            placeholder="Tên nguồn"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-rose-500 sm:col-span-2"
          />
          <select
            value={form.type}
            onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          >
            {AGENT_SOURCE_TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={10}
            value={form.priority}
            onChange={e => setForm(prev => ({ ...prev, priority: Number(e.target.value) }))}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            placeholder="Ưu tiên 1-10"
          />
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Lịch quét (phút)
            <input
              type="number"
              min={5}
              max={10080}
              required
              value={form.scanIntervalMinutes}
              onChange={e => setForm(prev => ({ ...prev, scanIntervalMinutes: Number(e.target.value) }))}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <input
            required
            placeholder="URL nguồn"
            value={form.url}
            onChange={e => setForm(prev => ({ ...prev, url: e.target.value }))}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm sm:col-span-2"
          />
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white">
              {editing ? 'Cập nhật' : 'Tạo nguồn'}
            </button>
            <button type="button" onClick={resetForm} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300">
              Hủy
            </button>
          </div>
        </form>
      )}

      {sources.length === 0 ? (
        <AgentPanelEmpty
          title="Chưa có nguồn quét"
          description="Thêm Facebook group hoặc website để worker thu thập bài viết."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Tên</th>
                <th className="px-3 py-3">Loại</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Lịch quét</th>
                <th className="px-3 py-3">Last / Next</th>
                <th className="px-3 py-3">Last scan</th>
                <th className="px-3 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(source => {
                const checkpoint = (source.checkpoint || {}) as {
                  lastStopReason?: string;
                  lastScanMetrics?: {
                    newPostsInserted?: number;
                    postsNew?: number;
                    findingsCreated?: number;
                    findings?: number;
                    stoppedReason?: string;
                  };
                  scanStats?: {
                    newPostsInserted?: number;
                    postsNew?: number;
                    findingsCreated?: number;
                    findings?: number;
                    stoppedReason?: string;
                  };
                };
                const scanStats = checkpoint.lastScanMetrics || checkpoint.scanStats;
                const postsNew = scanStats?.newPostsInserted ?? scanStats?.postsNew;
                const findings = scanStats?.findingsCreated ?? scanStats?.findings;
                const stopReason = checkpoint.lastStopReason || scanStats?.stoppedReason;
                return (
                <tr key={source.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                  <td className="px-3 py-3">
                    <div className="font-medium text-white">{source.name}</div>
                    <a href={source.url} target="_blank" rel="noreferrer" className="text-xs text-rose-400 hover:underline">
                      {source.url.slice(0, 48)}{source.url.length > 48 ? '…' : ''}
                    </a>
                    {source.lastError && (
                      <div className="mt-1 text-xs text-rose-400 line-clamp-1" title={source.lastError}>
                        {source.lastError}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-400">{source.type}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                      source.status === 'active' ? 'bg-emerald-900/40 text-emerald-300' :
                      source.status === 'error' ? 'bg-rose-900/40 text-rose-300' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {source.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-300">
                    mỗi {source.scanIntervalMinutes} phút
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-500">
                    <div>Last: {formatAgentDate(source.lastScannedAt)}</div>
                    <div>Next: {formatAgentDate(source.nextScanAt)}</div>
                  </td>
                  <td className="px-3 py-3 text-[11px] leading-relaxed text-slate-400">
                    <div className="text-emerald-300">mới {postsNew ?? '—'}</div>
                    <div>findings {findings ?? '—'}</div>
                    <div className="font-mono text-amber-200/80">{stopReason || '—'}</div>
                  </td>
                  <td className="px-3 py-3">
                    {canManage && (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={busyId === source.id}
                          onClick={() => handleScan(source)}
                          className="rounded bg-sky-900/50 px-2 py-1 text-xs text-sky-200"
                          title="Tạo job quét"
                        >
                          <ScanLine className="inline h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === source.id}
                          onClick={() => togglePause(source)}
                          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
                        >
                          {source.status === 'active' ? <Pause className="inline h-3 w-3" /> : <Play className="inline h-3 w-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(source);
                            setForm({
                              name: source.name,
                              type: source.type,
                              url: source.url,
                              priority: source.priority,
                              scanIntervalMinutes: source.scanIntervalMinutes,
                            });
                            setShowForm(true);
                          }}
                          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(source)}
                          className="rounded bg-rose-950/60 px-2 py-1 text-xs text-rose-300"
                        >
                          Xóa
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
