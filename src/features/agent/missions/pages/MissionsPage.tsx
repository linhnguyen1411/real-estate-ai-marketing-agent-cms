import React, { useCallback, useEffect, useState } from 'react';
import { Play, Plus, Sparkles, ListOrdered, X } from 'lucide-react';
import {
  activateAgentMission,
  cancelAgentMissionRun,
  createAgentMission,
  createAgentMissionFromTemplate,
  fetchAgentMissionRunDetail,
  fetchAgentMissionRuns,
  fetchAgentMissionTemplates,
  fetchAgentMissions,
  fetchAgentSources,
  pauseAgentMission,
  retryFailedAgentMissionRun,
  runAgentMission,
  updateAgentMission,
} from '../../../../services/agentPlatformApi';
import type {
  AgentMission,
  AgentMissionRunDetail,
  AgentMissionTemplate,
  AgentSource,
} from '../../../../types/agentPlatform';
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

function stepBadge(status: string) {
  if (status === 'completed') return '✓';
  if (status === 'skipped') return '–';
  if (status === 'failed') return '✗';
  if (status === 'running' || status === 'retrying') return '…';
  return '·';
}

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
  const [runsMissionId, setRunsMissionId] = useState<string | null>(null);
  const [runs, setRuns] = useState<
    Array<{ id: string; status: string; triggerType: string; createdAt: string }>
  >([]);
  const [runDetail, setRunDetail] = useState<AgentMissionRunDetail | null>(null);

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

  const openRuns = async (missionId: string) => {
    setRunsMissionId(missionId);
    setRunDetail(null);
    try {
      const res = await fetchAgentMissionRuns(missionId, { page: 1, limit: 20 });
      setRuns(
        res.data as Array<{ id: string; status: string; triggerType: string; createdAt: string }>,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không tải được runs.');
    }
  };

  const openRunDetail = async (runId: string) => {
    try {
      const detail = await fetchAgentMissionRunDetail(runId);
      setRunDetail(detail);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không tải được run detail.');
    }
  };

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
    if (mission.status === 'paused') await activateAgentMission(mission.id);
    else if (mission.status === 'active') await pauseAgentMission(mission.id);
    else await updateAgentMission(mission.id, { status: mission.status === 'draft' ? 'active' : 'paused' });
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Mission templates</h3>
            <button type="button" onClick={() => setShowTemplates(false)} className="text-xs text-slate-500">
              Đóng
            </button>
          </div>
          <select
            multiple
            value={templateSourceIds}
            onChange={e => setTemplateSourceIds(Array.from(e.target.selectedOptions).map(o => o.value))}
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
              <article key={template.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <h4 className="text-sm font-semibold text-white">{template.name}</h4>
                <p className="mt-1 text-xs text-slate-400 line-clamp-3">{template.objective}</p>
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
            placeholder="Mục tiêu"
            value={form.objective}
            onChange={e => setForm(prev => ({ ...prev, objective: e.target.value }))}
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
            const sched = mission.scheduler;
            const cadence = String(
              (sched?.schedule as { cadence?: string } | null)?.cadence ||
                (mission.schedule as { cadence?: string } | null)?.cadence ||
                'manual',
            );
            return (
              <article key={mission.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{mission.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{mission.objective}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-800 px-2 py-0.5 uppercase">{mission.status}</span>
                      {mission.templateKey && (
                        <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-300">
                          {mission.templateKey}
                        </span>
                      )}
                      <span>schedule: {cadence}</span>
                      {sched?.pipelineStepCount != null && <span>{sched.pipelineStepCount} steps</span>}
                      {sched?.sourceCount != null && <span>{sched.sourceCount} sources</span>}
                      {!!sched?.runningCount && (
                        <span className="text-amber-400">{sched.runningCount} running</span>
                      )}
                      {(sched?.lastRunAt || mission.lastRunAt) && (
                        <span>last: {formatAgentDate(sched?.lastRunAt || mission.lastRunAt || '')}</span>
                      )}
                      {(sched?.nextRunAt || mission.nextRunAt) && (
                        <span>next: {formatAgentDate(sched?.nextRunAt || mission.nextRunAt || '')}</span>
                      )}
                      {sched?.lastRunStatus && <span>lastStatus: {sched.lastRunStatus}</span>}
                      {sched?.schedulerSkipReason && (
                        <span className="text-amber-400/80">skip: {sched.schedulerSkipReason}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openRuns(mission.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                    >
                      <ListOrdered className="h-3.5 w-3.5" />
                      View runs
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === mission.id || mission.status === 'completed'}
                          onClick={() => handleRun(mission)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Run now
                        </button>
                        {mission.status !== 'completed' && (
                          <button
                            type="button"
                            onClick={() => togglePause(mission)}
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                          >
                            {mission.status === 'paused' || mission.status === 'draft'
                              ? 'Activate'
                              : 'Pause'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {runsMissionId && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50">
          <div className="flex h-full w-full max-w-xl flex-col border-l border-slate-800 bg-slate-950 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">
                {runDetail ? `Run ${runDetail.id.slice(-8)}` : 'Mission runs'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (runDetail) setRunDetail(null);
                  else {
                    setRunsMissionId(null);
                    setRuns([]);
                  }
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!runDetail ? (
                <ul className="space-y-2">
                  {runs.length === 0 && <li className="text-xs text-slate-500">Chưa có run.</li>}
                  {runs.map(run => (
                    <li key={run.id}>
                      <button
                        type="button"
                        onClick={() => openRunDetail(run.id)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-left text-xs hover:border-slate-600"
                      >
                        <div className="font-medium text-white">{run.status}</div>
                        <div className="mt-0.5 text-slate-500">
                          {run.triggerType} · {formatAgentDate(run.createdAt)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                    <span className="rounded bg-slate-800 px-2 py-0.5 uppercase">{runDetail.status}</span>
                    <span>v{runDetail.pipelineVersion}</span>
                    {runDetail.durationMs != null && (
                      <span>{Math.round(runDetail.durationMs / 1000)}s</span>
                    )}
                    <span>
                      steps {runDetail.stepSummary.completed}/{runDetail.stepSummary.total}
                    </span>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                        onClick={async () => {
                          await retryFailedAgentMissionRun(runDetail.id);
                          openRunDetail(runDetail.id);
                        }}
                      >
                        Retry failed
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-800 px-3 py-1.5 text-xs text-rose-300"
                        onClick={async () => {
                          await cancelAgentMissionRun(runDetail.id);
                          openRunDetail(runDetail.id);
                        }}
                      >
                        Cancel run
                      </button>
                    </div>
                  )}
                  <ol className="space-y-1.5">
                    {runDetail.steps.map(step => (
                      <li
                        key={step.id}
                        className="rounded border border-slate-800/80 bg-slate-900/40 px-2.5 py-1.5 text-xs"
                      >
                        <div className="flex gap-2">
                          <span className="w-4 text-center text-slate-400">{stepBadge(step.status)}</span>
                          <div>
                            <div className="font-medium text-slate-200">
                              {step.stepType}{' '}
                              <span className="text-slate-500">{step.status}</span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-slate-500">
                              {step.executionTarget && <span>{step.executionTarget}</span>}
                              {step.attempts > 0 && <span>attempts {step.attempts}</span>}
                              {step.findingId && <span>Finding …{step.findingId.slice(-6)}</span>}
                              {step.externalInventoryId && (
                                <span>Inv …{step.externalInventoryId.slice(-6)}</span>
                              )}
                              {step.errorMessage && (
                                <span className="text-rose-400">{step.errorMessage}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
