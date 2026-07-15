import React, { useCallback, useEffect, useState } from 'react';
import { Play, Plus, Sparkles } from 'lucide-react';
import {
  createAgentMission,
  createAgentMissionFromTemplate,
  fetchAgentMissionTemplates,
  fetchAgentMissions,
  fetchAgentSources,
  runAgentMission,
  updateAgentMission,
} from '../../../../services/agentPlatformApi';
import type { AgentMission, AgentMissionTemplate, AgentSource } from '../../../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

type Props = { canManage: boolean };

const EMPTY_FORM = {
  name: '',
  objective: '',
  sourceIds: [] as string[],
  keywords: '',
  negativeKeywords: '',
  minScore: 60,
  notifyScore: 75,
  maxItemsPerRun: 40,
  analysisInstructions: '',
};

export default function AgentMissions({ canManage }: Props) {
  const [missions, setMissions] = useState<AgentMission[]>([]);
  const [templates, setTemplates] = useState<AgentMissionTemplate[]>([]);
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [templateSourceIds, setTemplateSourceIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [missionsRes, sourcesRes, templatesRes] = await Promise.all([
        fetchAgentMissions({ page: 1, limit: 50 }),
        fetchAgentSources({ page: 1, limit: 100 }),
        fetchAgentMissionTemplates(),
      ]);
      setMissions(missionsRes.data);
      setSources(sourcesRes.data);
      setTemplates(templatesRes);
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
      const positiveKeywords = form.keywords.split(',').map(k => k.trim()).filter(Boolean);
      const negativeKeywords = form.negativeKeywords.split(',').map(k => k.trim()).filter(Boolean);
      await createAgentMission({
        name: form.name,
        objective: form.objective,
        rules: {
          sourceIds: form.sourceIds,
          keywords: positiveKeywords,
          positiveKeywords,
          negativeKeywords,
          minScore: form.minScore,
          minFindingScore: form.minScore,
          notifyScore: form.notifyScore,
          maxItemsPerRun: form.maxItemsPerRun,
          analysisInstructions: form.analysisInstructions || undefined,
        },
        schedule: { cadence: 'manual' },
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage('Đã tạo mission.');
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Tạo mission thất bại.');
    }
  };

  const handleCreateFromTemplate = async (template: AgentMissionTemplate) => {
    if (!canManage) return;
    setBusyId(template.id);
    setMessage('');
    try {
      await createAgentMissionFromTemplate({
        templateId: template.id,
        sourceIds: templateSourceIds.length ? templateSourceIds : undefined,
        status: 'draft',
      });
      setMessage(`Đã tạo mission từ template: ${template.name}`);
      setShowTemplates(false);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Tạo từ template thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRun = async (mission: AgentMission) => {
    if (!canManage) return;
    setBusyId(mission.id);
    setMessage('');
    try {
      const result = await runAgentMission(mission.id);
      setMessage(
        `MissionRun ${(result as { missionRunId?: string }).missionRunId || '—'} · enqueue ${result.jobsCreated} job` +
          ((result as { jobsSkipped?: number }).jobsSkipped
            ? ` (skip ${(result as { jobsSkipped?: number }).jobsSkipped} — source đang scan)`
            : ''),
      );
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
        title="Mission Workflow Engine"
        subtitle="Mission 2.0 — pipeline cấu hình được · Run tạo MissionRun + source jobs"
        onRefresh={load}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowTemplates(true);
                  setShowForm(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Từ template
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(true);
                  setShowTemplates(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Tạo mission
              </button>
            </div>
          ) : undefined
        }
      />

      {message && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}

      {showTemplates && canManage && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Mission templates</h3>
              <p className="text-xs text-slate-500">
                Chọn nguồn (tuỳ chọn) rồi tạo mission draft từ template.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTemplates(false)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Đóng
            </button>
          </div>
          <select
            multiple
            value={templateSourceIds}
            onChange={e => {
              setTemplateSourceIds(Array.from(e.target.selectedOptions).map(o => o.value));
            }}
            className="min-h-[72px] w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          >
            {sources.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.type})
              </option>
            ))}
          </select>
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map(template => (
              <article
                key={template.id}
                className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
              >
                <h4 className="text-sm font-semibold text-white">{template.name}</h4>
                {template.workflowVersion === 2 ? (
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-emerald-400">
                    Workflow · {template.pipeline?.steps?.length ?? 0} steps · {template.category}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-400 line-clamp-3">{template.objective}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">
                    min {template.rules.minFindingScore}
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">
                    notify {template.rules.notifyScore}
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">
                    max {template.rules.maxItemsPerRun}/run
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">
                    {template.schedule.cadence}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busyId === template.id}
                  onClick={() => handleCreateFromTemplate(template)}
                  className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  Tạo từ template
                </button>
              </article>
            ))}
          </div>
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
            placeholder="Positive keywords (phân tách bằng dấu phẩy)"
            value={form.keywords}
            onChange={e => setForm(prev => ({ ...prev, keywords: e.target.value }))}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            placeholder="Negative keywords"
            value={form.negativeKeywords}
            onChange={e => setForm(prev => ({ ...prev, negativeKeywords: e.target.value }))}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={form.minScore}
              onChange={e => setForm(prev => ({ ...prev, minScore: Number(e.target.value) }))}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              placeholder="minFindingScore"
              title="minFindingScore"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={form.notifyScore}
              onChange={e => setForm(prev => ({ ...prev, notifyScore: Number(e.target.value) }))}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              placeholder="notifyScore"
              title="notifyScore"
            />
            <input
              type="number"
              min={1}
              max={200}
              value={form.maxItemsPerRun}
              onChange={e => setForm(prev => ({ ...prev, maxItemsPerRun: Number(e.target.value) }))}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              placeholder="maxItemsPerRun"
              title="maxItemsPerRun"
            />
          </div>
          <textarea
            rows={2}
            placeholder="Analysis instructions"
            value={form.analysisInstructions}
            onChange={e => setForm(prev => ({ ...prev, analysisInstructions: e.target.value }))}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
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
        <AgentPanelEmpty title="Chưa có mission" description="Tạo từ template hoặc mission tùy chỉnh." />
      ) : (
        <div className="space-y-3">
          {missions.map(mission => {
            const rules = (mission.rules || {}) as {
              minScore?: number;
              minFindingScore?: number;
              notifyScore?: number;
              maxItemsPerRun?: number;
              keywords?: string[];
              positiveKeywords?: string[];
              templateId?: string;
            };
            const positives = rules.positiveKeywords ?? rules.keywords ?? [];
            return (
              <article key={mission.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{mission.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{mission.objective}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-800 px-2 py-0.5 uppercase">{mission.status}</span>
                      {mission.templateKey ? (
                        <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-300">
                          {mission.templateKey}
                        </span>
                      ) : null}
                      {Array.isArray((mission.pipeline as { steps?: unknown[] } | null)?.steps) ? (
                        <span>
                          {(mission.pipeline as { steps: unknown[] }).steps.length} steps · v
                          {mission.pipelineVersion ?? 1}
                        </span>
                      ) : null}
                      {mission.lastRunAt ? <span>Last run {formatAgentDate(mission.lastRunAt)}</span> : null}
                      {rules.templateId && (
                        <span className="rounded bg-rose-950/40 px-2 py-0.5 text-rose-400/80">
                          template: {rules.templateId}
                        </span>
                      )}
                      {(rules.minFindingScore ?? rules.minScore) !== undefined && (
                        <span>minScore: {rules.minFindingScore ?? rules.minScore}</span>
                      )}
                      {rules.notifyScore !== undefined && <span>notify: {rules.notifyScore}</span>}
                      {rules.maxItemsPerRun !== undefined && (
                        <span>max/run: {rules.maxItemsPerRun}</span>
                      )}
                      {positives.length > 0 && (
                        <span>keywords: {positives.slice(0, 5).join(', ')}{positives.length > 5 ? '…' : ''}</span>
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
