import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Check, Copy, Eye, Plus, Send, Sparkles, X } from 'lucide-react';
import {
  approveSocialDraft,
  archiveSocialDraft,
  createSocialDraft,
  duplicateSocialDraft,
  fetchSocialChannels,
  fetchSocialDrafts,
  publishSocialDraftNow,
  regenerateSocialDraft,
  rejectSocialDraft,
  scheduleSocialDraft,
  submitSocialDraftReview,
  updateSocialDraft,
} from '../../../../services/socialPublishingApi';
import type { SocialChannel, SocialPostDraft } from '../../../../types/socialPublishing';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

const EMPTY_FORM = {
  title: '',
  body: '',
  linkUrl: '',
  mediaUrls: '',
};

type Props = {
  canManage: boolean;
  onMessage: (msg: string) => void;
};

function draftStatusClass(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-slate-700 text-slate-200',
    pending_review: 'bg-amber-900/50 text-amber-300',
    approved: 'bg-emerald-900/50 text-emerald-300',
    rejected: 'bg-rose-900/50 text-rose-300',
    scheduled: 'bg-sky-900/50 text-sky-300',
    publishing: 'bg-indigo-900/50 text-indigo-300',
    published: 'bg-emerald-900/50 text-emerald-200',
    archived: 'bg-slate-800 text-slate-500',
  };
  return map[status] || 'bg-slate-800 text-slate-300';
}

export default function DraftsPanel({ canManage, onMessage }: Props) {
  const [drafts, setDrafts] = useState<SocialPostDraft[]>([]);
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SocialPostDraft | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [scheduleDraftId, setScheduleDraftId] = useState<string | null>(null);
  const [scheduleChannelId, setScheduleChannelId] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [draftList, channelList] = await Promise.all([
        fetchSocialDrafts({ status: statusFilter || undefined }),
        fetchSocialChannels({ includeInactive: false }),
      ]);
      setDrafts(draftList);
      setChannels(channelList.filter(c => c.status === 'active' || c.isActive));
      if (!scheduleChannelId && channelList[0]) {
        setScheduleChannelId(channelList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được bản nháp.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, scheduleChannelId]);

  useEffect(() => {
    load();
  }, [load]);

  const previewDraft = useMemo(
    () => drafts.find(d => d.id === previewId) || null,
    [drafts, previewId],
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (draft: SocialPostDraft) => {
    setEditing(draft);
    setForm({
      title: draft.title || '',
      body: draft.body || '',
      linkUrl: draft.linkUrl || '',
      mediaUrls: (draft.media || []).map(m => m.fileUrl).join('\n'),
    });
    setShowForm(true);
  };

  const parseMedia = () =>
    form.mediaUrls
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map((fileUrl, index) => ({ type: 'image', fileUrl, sortOrder: index }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    setBusyId('save');
    try {
      const payload = {
        title: form.title.trim() || null,
        body: form.body,
        linkUrl: form.linkUrl.trim() || null,
        media: parseMedia(),
      };
      if (editing) {
        await updateSocialDraft(editing.id, payload);
        onMessage('Đã cập nhật bản nháp.');
      } else {
        await createSocialDraft(payload);
        onMessage('Đã tạo bản nháp.');
      }
      resetForm();
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Lưu bản nháp thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const runAction = async (id: string, action: () => Promise<unknown>, okMsg: string) => {
    if (!canManage) return;
    setBusyId(id);
    try {
      await action();
      onMessage(okMsg);
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Thao tác thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveSchedule = async () => {
    if (!canManage || !scheduleDraftId || !scheduleChannelId || !scheduleAt) return;
    const draft = drafts.find(d => d.id === scheduleDraftId);
    if (!draft) return;
    setBusyId(scheduleDraftId);
    try {
      const scheduledAt = new Date(scheduleAt).toISOString();
      if (draft.status === 'approved' || draft.status === 'scheduled') {
        await scheduleSocialDraft(scheduleDraftId, {
          channelId: scheduleChannelId,
          scheduledAt,
        });
      } else {
        await approveSocialDraft(scheduleDraftId, {
          channelId: scheduleChannelId,
          scheduledAt,
        });
      }
      onMessage('Đã duyệt và lên lịch đăng.');
      setScheduleDraftId(null);
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Lên lịch thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePublishNow = async (draft: SocialPostDraft) => {
    if (!canManage) return;
    const channelId = scheduleChannelId || channels[0]?.id;
    if (!channelId) {
      onMessage('Chưa có kênh active để đăng.');
      return;
    }
    if (!window.confirm('Duyệt (nếu cần) và đăng ngay trên kênh đã chọn?')) return;
    await runAction(
      draft.id,
      () => publishSocialDraftNow(draft.id, { channelId }),
      'Đã xếp hàng đăng ngay.',
    );
  };

  if (loading && drafts.length === 0) {
    return <AgentPanelLoader label="Đang tải bản nháp..." />;
  }
  if (error && drafts.length === 0) {
    return <AgentPanelError message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <AgentPanelHeader
        title="Bản nháp"
        subtitle="Tạo / sửa nội dung → gửi duyệt → approve + schedule hoặc publish now"
        onRefresh={load}
        refreshing={loading}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="draft">draft</option>
              <option value="pending_review">pending_review</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="scheduled">scheduled</option>
              <option value="published">published</option>
            </select>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
              >
                <Plus className="h-3.5 w-3.5" /> Tạo bản nháp
              </button>
            )}
          </div>
        }
      />

      {showForm && canManage && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              Tiêu đề (nội bộ)
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Link URL
              <input
                value={form.linkUrl}
                onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="https://..."
              />
            </label>
          </div>
          <label className="block text-xs text-slate-400">
            Nội dung bài đăng
            <textarea
              required
              rows={6}
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Media URLs (mỗi dòng một URL)
            <textarea
              rows={3}
              value={form.mediaUrls}
              onChange={e => setForm(f => ({ ...f, mediaUrls: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              placeholder="https://cdn.example.com/image.jpg"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busyId === 'save'}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {editing ? 'Cập nhật' : 'Tạo mới'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {scheduleDraftId && canManage && (
        <div className="space-y-3 rounded-xl border border-sky-900/50 bg-sky-950/20 p-4">
          <h3 className="text-sm font-semibold text-sky-200">Duyệt + lên lịch</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              Kênh
              <select
                value={scheduleChannelId}
                onChange={e => setScheduleChannelId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                {channels.map(ch => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} ({ch.type})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Thời điểm đăng
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={e => setScheduleAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApproveSchedule}
              disabled={busyId === scheduleDraftId}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Xác nhận lịch
            </button>
            <button
              type="button"
              onClick={() => setScheduleDraftId(null)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {previewDraft && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Preview</h3>
            <button
              type="button"
              onClick={() => setPreviewId(null)}
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm text-slate-200">{previewDraft.body}</p>
          {previewDraft.linkUrl && (
            <a
              href={previewDraft.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-xs text-sky-400 hover:underline"
            >
              {previewDraft.linkUrl}
            </a>
          )}
          {(previewDraft.media || []).length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-400">
              {(previewDraft.media || []).map(m => (
                <li key={m.id}>
                  <a href={m.fileUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    {m.fileUrl}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {drafts.length === 0 ? (
        <AgentPanelEmpty
          title="Chưa có bản nháp"
          description="Tạo bản nháp thủ công hoặc để mission sinh pending_review."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Tiêu đề / nội dung</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Media</th>
                <th className="px-3 py-3">Cập nhật</th>
                {canManage && <th className="px-3 py-3">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {drafts.map(draft => (
                <tr key={draft.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-200">
                      {draft.title || 'Không tiêu đề'}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{draft.body}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${draftStatusClass(draft.status)}`}
                    >
                      {draft.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-400">
                    {(draft.media || []).length}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-400">
                    {formatAgentDate(draft.updatedAt)}
                  </td>
                  {canManage && (
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          title="Preview"
                          onClick={() => setPreviewId(draft.id)}
                          className="rounded border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {['draft', 'pending_review', 'rejected', 'approved'].includes(
                          draft.status,
                        ) && (
                          <button
                            type="button"
                            onClick={() => openEdit(draft)}
                            className="rounded border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800"
                          >
                            Sửa
                          </button>
                        )}
                        {['draft', 'rejected'].includes(draft.status) && (
                          <button
                            type="button"
                            disabled={busyId === draft.id}
                            onClick={() =>
                              runAction(
                                draft.id,
                                () => submitSocialDraftReview(draft.id),
                                'Đã gửi duyệt.',
                              )
                            }
                            className="inline-flex items-center gap-1 rounded border border-amber-800 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-950/40 disabled:opacity-50"
                          >
                            <Send className="h-3 w-3" /> Gửi duyệt
                          </button>
                        )}
                        {draft.status === 'pending_review' && (
                          <button
                            type="button"
                            disabled={busyId === draft.id}
                            onClick={() =>
                              runAction(
                                draft.id,
                                () => approveSocialDraft(draft.id),
                                'Đã duyệt bản nháp.',
                              )
                            }
                            className="inline-flex items-center gap-1 rounded border border-emerald-800 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" /> Approve
                          </button>
                        )}
                        {['draft', 'pending_review', 'rejected'].includes(draft.status) && (
                          <button
                            type="button"
                            disabled={busyId === draft.id}
                            onClick={() => {
                              setScheduleDraftId(draft.id);
                              setScheduleAt('');
                            }}
                            className="inline-flex items-center gap-1 rounded border border-emerald-800 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" /> Approve+Lịch
                          </button>
                        )}
                        {['approved', 'scheduled'].includes(draft.status) && (
                          <button
                            type="button"
                            onClick={() => {
                              setScheduleDraftId(draft.id);
                              setScheduleAt('');
                            }}
                            className="rounded border border-sky-800 px-2 py-1 text-[10px] font-bold text-sky-300 hover:bg-sky-950/40"
                          >
                            Lên lịch
                          </button>
                        )}
                        {['draft', 'pending_review', 'approved', 'scheduled', 'rejected'].includes(
                          draft.status,
                        ) && (
                          <button
                            type="button"
                            disabled={busyId === draft.id}
                            onClick={() => handlePublishNow(draft)}
                            className="rounded bg-rose-700/80 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-600 disabled:opacity-50"
                          >
                            Đăng ngay
                          </button>
                        )}
                        {draft.status === 'pending_review' && (
                          <button
                            type="button"
                            disabled={busyId === draft.id}
                            onClick={() =>
                              runAction(
                                draft.id,
                                () => rejectSocialDraft(draft.id, 'rejected_from_ui'),
                                'Đã từ chối.',
                              )
                            }
                            className="rounded border border-rose-900 px-2 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        )}
                        {!['archived', 'publishing'].includes(draft.status) && (
                          <button
                            type="button"
                            disabled={busyId === draft.id}
                            onClick={() =>
                              runAction(
                                draft.id,
                                () => duplicateSocialDraft(draft.id),
                                'Đã nhân bản bản nháp.',
                              )
                            }
                            className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                          >
                            <Copy className="h-3 w-3" /> Duplicate
                          </button>
                        )}
                        {['draft', 'pending_review', 'rejected'].includes(draft.status) && (
                          <button
                            type="button"
                            disabled={busyId === draft.id}
                            onClick={() =>
                              runAction(
                                draft.id,
                                () => regenerateSocialDraft(draft.id),
                                'Đã tái sinh nội dung AI.',
                              )
                            }
                            className="inline-flex items-center gap-1 rounded border border-violet-800 px-2 py-1 text-[10px] font-bold text-violet-300 hover:bg-violet-950/40 disabled:opacity-50"
                          >
                            <Sparkles className="h-3 w-3" /> AI
                          </button>
                        )}
                        {!['archived', 'published', 'publishing'].includes(draft.status) && (
                          <button
                            type="button"
                            disabled={busyId === draft.id}
                            onClick={() => {
                              if (!window.confirm('Lưu trữ (archive) bản nháp này?')) return;
                              runAction(
                                draft.id,
                                () => archiveSocialDraft(draft.id),
                                'Đã lưu trữ bản nháp.',
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-400 hover:bg-slate-800 disabled:opacity-50"
                          >
                            <Archive className="h-3 w-3" /> Archive
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
