/**
 * DEPRECATED publisher UI — inbound Graph / inbox only.
 * Unmounted from App; do not remount as an outbound Facebook auto-publisher.
 * Outbound publishing lives in server/modules/social-publishing.
 */
import React, { useEffect, useState } from 'react';
import {
  createLeadFromFacebookComment,
  createLeadFromFacebookConversation,
  fetchFacebookComments,
  fetchFacebookInbox,
  fetchFacebookInboxDetail,
  fetchFacebookLeads,
  updateFacebookCommentStatus,
  updateFacebookInboxStatus,
  type FacebookCommentItem,
  type FacebookInboxItem,
  type FacebookLeadItem,
  testFacebookConnection,
  type FacebookConnectionTest,
} from '../../services/facebookApi';
import { getAuthToken } from '../../services/api';

type FacebookTab = 'connection' | 'inbox' | 'comments' | 'leads';

function formatTime(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
}

export default function FacebookPanel() {
  const [tab, setTab] = useState<FacebookTab>('connection');
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<FacebookConnectionTest | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [inbox, setInbox] = useState<FacebookInboxItem[]>([]);
  const [comments, setComments] = useState<FacebookCommentItem[]>([]);
  const [leads, setLeads] = useState<FacebookLeadItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchFacebookInboxDetail>> | null>(null);
  const [actionLoading, setActionLoading] = useState('');

  const load = async () => {
    if (!getAuthToken()) {
      setInbox([]);
      setComments([]);
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [inboxRows, commentRows, leadRows] = await Promise.all([
        fetchFacebookInbox(),
        fetchFacebookComments(),
        fetchFacebookLeads(),
      ]);
      setInbox(inboxRows);
      setComments(commentRows);
      setLeads(leadRows);
    } catch (error) {
      console.error('[FacebookPanel]', error);
      setInbox([]);
      setComments([]);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  const runConnectionTest = async () => {
    setConnectionLoading(true);
    try {
      const result = await testFacebookConnection();
      setConnection(result);
    } catch (error) {
      setConnection({
        ok: false,
        testedAt: new Date().toISOString(),
        error: { message: error instanceof Error ? error.message : 'Test failed' },
      });
    } finally {
      setConnectionLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'connection') {
      runConnectionTest();
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selectedId || tab !== 'inbox') {
      setDetail(null);
      return;
    }
    fetchFacebookInboxDetail(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selectedId, tab]);

  const runAction = async (key: string, fn: () => Promise<unknown>) => {
    setActionLoading(key);
    try {
      await fn();
      await load();
      if (selectedId && tab === 'inbox') {
        const next = await fetchFacebookInboxDetail(selectedId);
        setDetail(next);
      }
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Kênh Facebook</h2>
          <p className="text-xs text-slate-500">
            Đồng bộ Messenger &amp; comment Fanpage — Sprint 1 không auto reply AI, không inbox người chỉ like.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white"
        >
          Làm mới
        </button>
      </div>

      <div className="flex gap-2">
        {([
          ['connection', 'Connection Test'],
          ['inbox', 'Inbox'],
          ['comments', 'Comments'],
          ['leads', 'Leads'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setSelectedId(null);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-bold ${
              tab === id ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'connection' ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-slate-500">Page ID</div>
              <div className="font-mono text-sm text-white">{connection?.pageId || '830631276801874'}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Page Name</div>
              <div className="text-sm text-white">{connection?.pageName || '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Token status</div>
              <div className={`text-sm font-bold ${connection?.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                {connectionLoading ? 'Đang test...' : connection?.ok ? 'Connected' : 'Failed'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Last test</div>
              <div className="text-sm text-slate-300">{connection?.testedAt ? formatTime(connection.testedAt) : '—'}</div>
            </div>
          </div>
          {connection?.error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              <div>{connection.error.message}</div>
              {connection.error.code != null && <div className="text-xs mt-1">Code: {connection.error.code}</div>}
              {connection.hint && <div className="text-xs mt-2 text-rose-300/80">{connection.hint}</div>}
            </div>
          )}
          {!getAuthToken() && (
            <p className="text-sm text-amber-300">Đăng nhập admin tại <code className="text-xs">/admin/login</code> để test token Graph API từ server.</p>
          )}
          <button
            type="button"
            onClick={runConnectionTest}
            disabled={connectionLoading}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Test connection
          </button>
        </div>
      ) : loading ? (
        <div className="p-8 text-center text-slate-400">Đang tải dữ liệu Facebook...</div>
      ) : tab === 'inbox' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5 space-y-2 max-h-[640px] overflow-y-auto">
            {inbox.length === 0 ? (
              <div className="rounded-xl border border-slate-800 p-6 text-sm text-slate-500">
                Chưa có hội thoại Messenger. Gửi tin nhắn thử tới Fanpage sau khi webhook đã verify.
              </div>
            ) : inbox.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedId === item.id ? 'border-rose-500/40 bg-rose-500/5' : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {item.contact.profilePic ? (
                    <img src={item.contact.profilePic} alt="" className="h-9 w-9 rounded-full object-cover" width={36} height={36} />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                      {(item.contact.name || 'FB').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white">{item.contact.name || `PSID ${item.contact.psid}`}</div>
                    <div className="truncate text-xs text-slate-400">{item.lastMessage?.text || '—'}</div>
                  </div>
                  <div className="text-right text-2xs text-slate-500">
                    <div>{formatTime(item.lastMessageAt)}</div>
                    <div className="mt-1 uppercase">{item.status}</div>
                    {item.contact.leadScore != null && (
                      <div className="mt-1 text-amber-400">Score {item.contact.leadScore}</div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            {!detail ? (
              <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-slate-500">
                Chọn một hội thoại để xem chi tiết
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white">{detail.contact.name || detail.contact.psid}</h3>
                    <p className="text-xs text-slate-500">Messenger · {detail.status}</p>
                    {detail.lead && (
                      <p className="mt-1 text-xs text-amber-400">
                        Lead: {detail.lead.name} · điểm {detail.lead.investorScore} · {detail.lead.status}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.messengerUrl && (
                      <a
                        href={detail.messengerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200"
                      >
                        Mở Facebook
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={actionLoading === 'create-lead'}
                      onClick={() => runAction('create-lead', () => createLeadFromFacebookConversation(detail.id))}
                      className="rounded-lg bg-amber-600/20 px-3 py-1.5 text-xs font-bold text-amber-300"
                    >
                      Tạo lead
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading === 'resolve'}
                      onClick={() => runAction('resolve', () => updateFacebookInboxStatus(detail.id, 'resolved'))}
                      className="rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-bold text-emerald-300"
                    >
                      Đã xử lý
                    </button>
                  </div>
                </div>

                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {detail.messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                        msg.direction === 'inbound'
                          ? 'bg-slate-900 text-slate-100'
                          : 'ml-auto bg-rose-950/30 text-rose-100'
                      }`}
                    >
                      <p>{msg.text || `[${msg.messageType}]`}</p>
                      <div className="mt-1 text-2xs text-slate-500">{formatTime(msg.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : tab === 'comments' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Comment</th>
                <th className="px-4 py-3">Người comment</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3">Private reply</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {comments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Chưa có comment nào được đồng bộ.
                  </td>
                </tr>
              ) : comments.map(row => (
                <tr key={row.id} className="border-t border-slate-800 align-top">
                  <td className="px-4 py-3 text-slate-200">
                    <div className="max-w-md whitespace-pre-wrap">{row.text || '—'}</div>
                    <div className="mt-1 text-2xs text-slate-500">{formatTime(row.createdAt)}</div>
                    {row.postUrl && (
                      <a href={row.postUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-2xs text-blue-400">
                        Xem bài viết
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{row.contact?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(row.intentTags || []).map(tag => (
                        <span key={tag} className="rounded bg-amber-500/15 px-2 py-0.5 text-2xs text-amber-300">{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {row.privateReplyEligible ? 'Có thể' : 'Không'}
                  </td>
                  <td className="px-4 py-3 text-xs uppercase text-slate-400">{row.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={actionLoading === `lead-${row.id}`}
                        onClick={() => runAction(`lead-${row.id}`, () => createLeadFromFacebookComment(row.id))}
                        className="rounded bg-amber-600/20 px-2 py-1 text-2xs font-bold text-amber-300"
                      >
                        Tạo lead
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading === `handled-${row.id}`}
                        onClick={() => runAction(`handled-${row.id}`, () => updateFacebookCommentStatus(row.id, 'handled'))}
                        className="rounded bg-emerald-600/20 px-2 py-1 text-2xs font-bold text-emerald-300"
                      >
                        Đã xử lý
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Khách</th>
                <th className="px-4 py-3">Nguồn</th>
                <th className="px-4 py-3">Tin đầu</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Điểm</th>
                <th className="px-4 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Chưa có lead Facebook nào.
                  </td>
                </tr>
              ) : leads.map(lead => (
                <tr key={lead.id} className="border-t border-slate-800">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{lead.name}</div>
                    <div className="text-xs text-slate-500">{lead.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{lead.sourceType || 'facebook'}</td>
                  <td className="px-4 py-3 max-w-sm text-slate-400 text-xs whitespace-pre-wrap">{lead.firstMessage || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lead.tags.map(tag => (
                        <span key={tag} className="rounded bg-slate-800 px-2 py-0.5 text-2xs text-slate-300">{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-amber-400">{lead.investorScore}</td>
                  <td className="px-4 py-3 text-xs uppercase text-slate-400">{lead.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
            Lead Facebook cũng xuất hiện trong tab &quot;Leads đầu tư&quot; nếu cùng pipeline CRM.
          </p>
        </div>
      )}
    </div>
  );
}
