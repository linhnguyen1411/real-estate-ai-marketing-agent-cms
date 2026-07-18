import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  cancelSocialJob,
  fetchSocialJobs,
  publishSocialJobNow,
  rescheduleSocialJob,
  retrySocialJob,
} from '../../../../services/socialPublishingApi';
import type { SocialPublishJob } from '../../../../types/socialPublishing';
import {
  jobStatusBucket,
  readPublishPermalink,
} from '../shared/jobHelpers';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

type Bucket = 'upcoming' | 'running' | 'completed' | 'failed';

const BUCKET_TABS: { id: Bucket; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'running', label: 'Running' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function jobStatusClass(status: string) {
  const map: Record<string, string> = {
    queued: 'bg-slate-700 text-slate-200',
    claimed: 'bg-indigo-900/50 text-indigo-300',
    preparing: 'bg-indigo-900/50 text-indigo-300',
    publishing: 'bg-sky-900/50 text-sky-300',
    published: 'bg-emerald-900/50 text-emerald-300',
    failed: 'bg-rose-900/50 text-rose-300',
    cancelled: 'bg-slate-800 text-slate-500',
    skipped: 'bg-slate-800 text-slate-400',
  };
  return map[status] || 'bg-slate-800 text-slate-300';
}

function dayKeyFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function mergeDateKeepTime(originalIso: string, targetDay: Date): string {
  const orig = new Date(originalIso);
  const next = new Date(targetDay.getFullYear(), targetDay.getMonth(), targetDay.getDate());
  if (!Number.isNaN(orig.getTime())) {
    next.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), 0);
  } else {
    next.setHours(12, 0, 0, 0);
  }
  return next.toISOString();
}

function buildMonthGrid(viewMonth: Date) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const cells: Array<{ key: string; date: Date; inMonth: boolean }> = [];

  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    cells.push({ key: dayKeyFromDate(d), date: d, inMonth: false });
  }
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    cells.push({ key: dayKeyFromDate(d), date: d, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month + 1, cells.length - startPad - lastDay + 1);
    cells.push({ key: dayKeyFromDate(d), date: d, inMonth: false });
  }
  return cells;
}

type Props = {
  canManage: boolean;
  onMessage: (msg: string) => void;
};

export default function CalendarQueuePanel({ canManage, onMessage }: Props) {
  const [jobs, setJobs] = useState<SocialPublishJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bucket, setBucket] = useState<Bucket>('upcoming');
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dropTargetDay, setDropTargetDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSocialJobs({});
      const sorted = [...data].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
      setJobs(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được lịch đăng.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredJobs = useMemo(
    () => jobs.filter(j => jobStatusBucket(j.status) === bucket),
    [jobs, bucket],
  );

  const jobsByDay = useMemo(() => {
    const map = new Map<string, SocialPublishJob[]>();
    for (const job of filteredJobs) {
      const key = dayKeyFromDate(new Date(job.scheduledAt));
      const list = map.get(key) || [];
      list.push(job);
      map.set(key, list);
    }
    return map;
  }, [filteredJobs]);

  const monthCells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const upcomingList = useMemo(
    () =>
      jobs
        .filter(j => jobStatusBucket(j.status) === 'upcoming')
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [jobs],
  );

  const shiftMonth = (delta: number) => {
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const handleReschedule = async (jobId: string, dayKey: string) => {
    if (!canManage) return;
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    const targetDay = parseDayKey(dayKey);
    const scheduledAt = mergeDateKeepTime(job.scheduledAt, targetDay);
    setBusyId(jobId);
    try {
      await rescheduleSocialJob(jobId, scheduledAt);
      onMessage(`Đã dời lịch sang ${formatAgentDate(scheduledAt)}.`);
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Reschedule thất bại.');
    } finally {
      setBusyId(null);
      setDragJobId(null);
      setDropTargetDay(null);
    }
  };

  const handleCancel = async (job: SocialPublishJob) => {
    if (!canManage || !window.confirm('Hủy job này?')) return;
    setBusyId(job.id);
    try {
      await cancelSocialJob(job.id);
      onMessage('Đã hủy job.');
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Hủy thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRetry = async (job: SocialPublishJob) => {
    if (!canManage) return;
    setBusyId(job.id);
    try {
      const res = await retrySocialJob(job.id);
      onMessage(
        res.skipped
          ? `Bỏ qua retry (${res.reason || 'already_published'}).`
          : 'Đã xếp lại hàng đợi.',
      );
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Retry thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePublishNow = async (job: SocialPublishJob) => {
    if (!canManage || !window.confirm('Đăng job này ngay?')) return;
    setBusyId(job.id);
    try {
      await publishSocialJobNow(job.id);
      onMessage('Đã kích hoạt publish now.');
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Publish now thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const renderJobChip = (job: SocialPublishJob, compact = false) => {
    const draggable = canManage && ['queued', 'failed'].includes(job.status);
    const postUrl = job.status === 'published' ? readPublishPermalink(job) : null;

    return (
      <div
        key={job.id}
        draggable={draggable}
        onDragStart={e => {
          if (!draggable) return;
          e.dataTransfer.setData('text/job-id', job.id);
          e.dataTransfer.effectAllowed = 'move';
          setDragJobId(job.id);
        }}
        onDragEnd={() => {
          setDragJobId(null);
          setDropTargetDay(null);
        }}
        className={`rounded border border-slate-700/80 bg-slate-900/80 p-1.5 text-[10px] ${
          draggable ? 'cursor-grab active:cursor-grabbing' : ''
        } ${busyId === job.id ? 'opacity-50' : ''}`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-slate-200">
              {job.draft?.title || job.draftId.slice(0, 8)}
            </div>
            <div className="truncate text-slate-500">{job.channel?.name || job.channelId.slice(0, 8)}</div>
            {!compact && (
              <div className="mt-0.5 text-slate-500">{formatAgentDate(job.scheduledAt)}</div>
            )}
          </div>
          <span
            className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${jobStatusClass(job.status)}`}
          >
            {job.status}
          </span>
        </div>
        {postUrl && (
          <a
            href={postUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-0.5 text-sky-400 hover:underline"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="h-2.5 w-2.5" /> Post
          </a>
        )}
        {canManage && !compact && (
          <div className="mt-1 flex flex-wrap gap-0.5">
            {job.status === 'queued' && (
              <button
                type="button"
                disabled={busyId === job.id}
                onClick={() => handlePublishNow(job)}
                className="inline-flex items-center gap-0.5 rounded border border-rose-800 px-1 py-0.5 text-[9px] font-bold text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
              >
                <Play className="h-2.5 w-2.5" /> Now
              </button>
            )}
            {['queued', 'failed', 'skipped'].includes(job.status) && (
              <button
                type="button"
                disabled={busyId === job.id}
                onClick={() => handleCancel(job)}
                className="inline-flex items-center gap-0.5 rounded border border-slate-700 px-1 py-0.5 text-[9px] font-bold text-slate-400 hover:bg-slate-800 disabled:opacity-50"
              >
                <XCircle className="h-2.5 w-2.5" /> Hủy
              </button>
            )}
            {['failed', 'skipped'].includes(job.status) && (
              <button
                type="button"
                disabled={busyId === job.id}
                onClick={() => handleRetry(job)}
                className="inline-flex items-center gap-0.5 rounded border border-amber-800 px-1 py-0.5 text-[9px] font-bold text-amber-300 hover:bg-amber-950/40 disabled:opacity-50"
              >
                <RotateCcw className="h-2.5 w-2.5" /> Retry
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading && jobs.length === 0) {
    return <AgentPanelLoader label="Đang tải lịch đăng..." />;
  }
  if (error && jobs.length === 0) {
    return <AgentPanelError message={error} onRetry={load} />;
  }

  const monthLabel = viewMonth.toLocaleString('vi-VN', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <AgentPanelHeader
        title="Lịch đăng"
        subtitle="Lưới tháng — kéo thả job queued/failed sang ngày khác"
        onRefresh={load}
        refreshing={loading}
        actions={
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
            {BUCKET_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setBucket(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  bucket === tab.id
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold capitalize text-white">{monthLabel}</span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {filteredJobs.length === 0 ? (
            <AgentPanelEmpty
              title={`Không có job (${bucket})`}
              description="Đổi tab hoặc duyệt + lên lịch bản nháp."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-900">
                {WEEKDAYS.map(w => (
                  <div
                    key={w}
                    className="px-2 py-2 text-center text-[10px] font-bold uppercase text-slate-500"
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthCells.map(cell => {
                  const dayJobs = jobsByDay.get(cell.key) || [];
                  const isDropTarget = dropTargetDay === cell.key;
                  const todayKey = dayKeyFromDate(new Date());
                  return (
                    <div
                      key={cell.key}
                      onDragOver={e => {
                        if (!canManage || !dragJobId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTargetDay(cell.key);
                      }}
                      onDragLeave={() => {
                        if (dropTargetDay === cell.key) setDropTargetDay(null);
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        const jobId = e.dataTransfer.getData('text/job-id') || dragJobId;
                        if (jobId) void handleReschedule(jobId, cell.key);
                      }}
                      className={`min-h-[100px] border-b border-r border-slate-800/80 p-1.5 ${
                        cell.inMonth ? 'bg-slate-950/40' : 'bg-slate-950/20'
                      } ${isDropTarget ? 'ring-2 ring-inset ring-rose-500/50' : ''} ${
                        cell.key === todayKey ? 'bg-rose-950/10' : ''
                      }`}
                    >
                      <div
                        className={`mb-1 text-[11px] font-semibold tabular-nums ${
                          cell.inMonth ? 'text-slate-300' : 'text-slate-600'
                        } ${cell.key === todayKey ? 'text-rose-300' : ''}`}
                      >
                        {cell.date.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayJobs.slice(0, 3).map(job => renderJobChip(job, true))}
                        {dayJobs.length > 3 && (
                          <div className="text-[9px] text-slate-500">+{dayJobs.length - 3} job</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Upcoming queue
          </h3>
          {upcomingList.length === 0 ? (
            <AgentPanelEmpty title="Không có job sắp tới" description="Queue trống." />
          ) : (
            <div className="max-h-[520px] space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/30 p-2">
              {upcomingList.map(job => renderJobChip(job))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
