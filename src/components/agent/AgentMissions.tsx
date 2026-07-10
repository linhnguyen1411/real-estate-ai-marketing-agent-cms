import React, { useCallback, useEffect, useState } from 'react';
import { Play, Plus } from 'lucide-react';
import {
  createAgentMission,
  fetchAgentMissions,
  fetchAgentSources,
  runAgentMission,
  updateAgentMission,
} from '../../services/agentPlatformApi';
import type { AgentMission, AgentSource } from '../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from './AgentPlatformUi';

type Props = { canManage: boolean };

const EMPTY_FORM = {
  name: '',
  objective: '',
  sourceIds: [] as string[],
  keywords: '',
  minScore: 60,
};

export default function AgentMissions({ canManage }: Props) {
  const [missions, setMissions] = useState<AgentMission[]>([]);
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [missionsRes, sourcesRes] = await Promise.all([
        fetchAgentMissions({ page: 1, limit: 50 }),
        fetchAgentSources({ page: 1, limit: 100 }),
      ]);
      setMissions(missionsRes.data);
      setSources(sourcesRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được mission.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    setMessage('');
    try {
      const keywords = form.keywords.split(',').map(k => k.trim()).filter(Boolean);
      await createAgentMission({
        name: form.name,
        objective: form.objective,
        rules: {
          sourceIds: form.sourceIds,
          keywords,
          minScore: form.minScore,
        },
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage('Đã tạo mission.');
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Tạo mission thất bại.');
    }
  };

  const handleRun = async (mission: AgentMission) => {
    if (!canManage) return;
    setBusyId(mission.id);
    setMessage('');
    try {
      const result = await runAgentMission(mission.id);
      setMessage(`Đã enqueue ${result.jobsCreated} job — worker sẽ xử lý.`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Chạy mission thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const togglePause = async (mission: AgentMission) => {
    if (!canManage) return;
    const next = mission.status === 'paused' ? 'active' : 'paused';
    await updateAgentMission(mission.id, { status: next });
    load();
  };

  if (loading) return <AgentPanelLoader label="Đang tải mission..." />;
  if (error) return <AgentPanelError message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Mission AI Agent"
        subtitle="Mục tiêu quét + rules — Chạy ngay chỉ enqueue job"
        onRefresh={load}
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo mission
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
        <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <input
            required
            placeholder="Tên mission"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          />
          <textarea
            required
            rows={3}
            placeholder="Mục tiêu (objective)"
            value={form.objective}
            onChange={e => setForm(prev => ({ ...prev, objective: e.target.value }))}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          />
          <div>
            <label className="mb-1 block text-xs text-slate-500">Chọn nguồn</label>
            <select
              multiple
              value={form.sourceIds}
              onChange={e => {
                const selected = Array.from(e.target.selectedOptions).map(o => o.value);
                setForm(prev => ({ ...prev, sourceIds: selected }));
              }}
              className="min-h-[88px] w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            >
              {sources.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
              ))}
            </select>
          </div>
          <input
            placeholder="Keywords (phân tách bằng dấu phẩy)"
            value={form.keywords}
            onChange={e => setForm(prev => ({ ...prev, keywords: e.target.value }))}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={form.minScore}
            onChange={e => setForm(prev => ({ ...prev, minScore: Number(e.target.value) }))}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            placeholder="minScore"
          />
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white">
              Lưu mission
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300">
              Hủy
            </button>
          </div>
        </form>
      )}

      {missions.length === 0 ? (
        <AgentPanelEmpty title="Chưa có mission" description="Tạo mission để gom nguồn và rules phân tích." />
      ) : (
        <div className="space-y-3">
          {missions.map(mission => {
            const rules = (mission.rules || {}) as { minScore?: number; keywords?: string[] };
            return (
              <article key={mission.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{mission.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{mission.objective}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-800 px-2 py-0.5 uppercase">{mission.status}</span>
                      {rules.minScore !== undefined && <span>minScore: {rules.minScore}</span>}
                      {Array.isArray(rules.keywords) && rules.keywords.length > 0 && (
                        <span>keywords: {rules.keywords.join(', ')}</span>
                      )}
                      <span>Cập nhật: {formatAgentDate(mission.updatedAt)}</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busyId === mission.id || mission.status === 'completed'}
                        onClick={() => handleRun(mission)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Chạy ngay
                      </button>
                      {mission.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => togglePause(mission)}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                        >
                          {mission.status === 'paused' ? 'Resume' : 'Pause'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
