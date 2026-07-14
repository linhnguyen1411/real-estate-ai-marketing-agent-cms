import React from 'react';
import { MessageSquare, RefreshCw, Send, Trash2 } from 'lucide-react';
import MarkdownContent from '../../../components/MarkdownContent';
import type { ChatHistoryRecord, PublicChatGuest } from '../../../types';

type HistorySession = {
  sessionId: string;
  records: ChatHistoryRecord[];
  lastMessageAt: number;
};

type Props = {
  chatHistorySessions: HistorySession[];
  selectedChatHistorySession: HistorySession | undefined;
  setSelectedChatHistorySessionId: (id: string) => void;
  setGuestReplyInput: (v: string) => void;
  selectedHistoryGuest: PublicChatGuest | undefined;
  guestReplyInput: string;
  actionLoading: string | null;
  reloading: boolean;
  canDeleteChatSession: (sessionUserId: string) => boolean;
  onReload: () => void;
  onToggleGuestAi: (guest: PublicChatGuest) => void;
  onDeleteChatSession: (sessionUserId: string, label: string) => void;
  onSendHistoryGuestReply: () => void;
};

export default function ChatHistoryPanel({
  chatHistorySessions,
  selectedChatHistorySession,
  setSelectedChatHistorySessionId,
  setGuestReplyInput,
  selectedHistoryGuest,
  guestReplyInput,
  actionLoading,
  reloading,
  canDeleteChatSession,
  onReload,
  onToggleGuestAi,
  onDeleteChatSession,
  onSendHistoryGuestReply,
}: Props) {
  return (
<div className="space-y-6">
  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div>
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-rose-500" />
        Lịch sử trò chuyện
      </h2>
      <p className="text-slate-400 text-sm">
        Theo dõi toàn bộ hội thoại đã lưu từ chatbot public và chatbot nội bộ CMS.
      </p>
    </div>
    <button
      type="button"
      onClick={onReload}
      disabled={reloading}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-rose-500/60 disabled:opacity-50 sm:w-auto"
    >
      <RefreshCw className={`w-4 h-4 ${reloading ? 'animate-spin' : ''}`} />
      Tải lại lịch sử
    </button>
  </div>

  <div className="grid overflow-hidden rounded-2xl border border-slate-900 bg-slate-900/40 lg:min-h-[620px] lg:grid-cols-[330px_1fr]">
    <aside className="border-b border-slate-900 bg-slate-950/70 lg:border-b-0 lg:border-r">
      <div className="border-b border-slate-900 p-3 sm:p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">User/session đã chat</div>
        <div className="mt-1 text-sm text-slate-300">{chatHistorySessions.length} hội thoại</div>
      </div>
      <div className="max-h-64 overflow-y-auto p-2 app-scroll sm:max-h-80 sm:p-3 lg:max-h-[560px]">
        {chatHistorySessions.map(session => {
          const isPublicSession = session.sessionId.startsWith('public-');
          const lastMessage = session.records[session.records.length - 1];
          const selected = selectedChatHistorySession?.sessionId === session.sessionId;
          return (
            <button
              key={session.sessionId}
              type="button"
              onClick={() => {
                setSelectedChatHistorySessionId(session.sessionId);
                setGuestReplyInput('');
              }}
              className={`mb-2 w-full rounded-xl border p-2.5 text-left transition-all sm:p-3 ${
                selected ? 'border-rose-500/50 bg-rose-500/10' : 'border-slate-900 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${
                  isPublicSession ? 'bg-emerald-500/10 text-emerald-300' : 'bg-indigo-500/10 text-indigo-300'
                }`}>
                  {isPublicSession ? 'Public' : 'CMS'}
                </span>
                <span className="text-2xs text-slate-600">{session.records.length} tin</span>
              </div>
              <div className="mt-2 truncate text-[11px] font-mono text-slate-300 sm:text-xs">{session.sessionId}</div>
              <div className="mt-2 text-2xs text-slate-600">
                {lastMessage ? new Date(lastMessage.created_at).toLocaleString('vi-VN') : ''}
              </div>
            </button>
          );
        })}
        {chatHistorySessions.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500">Chưa có lịch sử chat phù hợp.</div>
        )}
      </div>
    </aside>

    <section className="flex min-h-[430px] min-w-0 flex-col border-t border-slate-900 lg:min-h-0 lg:border-t-0">
      {selectedChatHistorySession ? (
        <>
          <div className="flex flex-col gap-2 border-b border-slate-900 bg-slate-950 px-3 py-3 sm:px-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">
                {selectedChatHistorySession.sessionId.startsWith('public-') ? 'Public website' : 'CMS nội bộ'}
              </div>
              <div className="truncate text-xs font-mono text-slate-500">{selectedChatHistorySession.sessionId}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs text-slate-500">
                {selectedChatHistorySession.records.length} tin nhắn
              </div>
              {canDeleteChatSession(selectedChatHistorySession.sessionId) && (
                <button
                  type="button"
                  onClick={() => onDeleteChatSession(
                    selectedChatHistorySession.sessionId,
                    selectedChatHistorySession.sessionId.startsWith('public-') ? 'hội thoại khách website' : 'hội thoại CMS nội bộ'
                  )}
                  disabled={actionLoading === `delete-chat-${selectedChatHistorySession.sessionId}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:border-rose-500/60 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa hội thoại
                </button>
              )}
            </div>
          </div>

          {selectedHistoryGuest && (
            <div className="border-b border-slate-900 bg-slate-950/70 px-3 py-2 sm:px-4">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200">
                <input
                  type="checkbox"
                  checked={Boolean(selectedHistoryGuest.ai_enabled)}
                  onChange={() => onToggleGuestAi(selectedHistoryGuest)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-500"
                />
                AI tự trả lời
              </label>
            </div>
          )}

          <div className="h-[420px] space-y-3 overflow-y-auto p-3 app-scroll sm:h-[520px] sm:p-4 lg:h-[560px]">
            {selectedChatHistorySession.records.map(record => (
              <div key={record.id} className={`flex ${record.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-6 sm:max-w-3xl sm:px-4 sm:py-3 ${
                  record.role === 'user'
                    ? 'rounded-tl-none border border-slate-800 bg-slate-950 text-slate-200'
                    : 'rounded-tr-none bg-rose-600 text-white'
                }`}>
                  <MarkdownContent content={record.message} compact className="break-words" />
                  <div className={`mt-2 text-2xs ${record.role === 'user' ? 'text-slate-500' : 'text-rose-100'}`}>
                    {record.role === 'user' ? 'Khách/User' : 'AI/Admin'} · {new Date(record.created_at).toLocaleString('vi-VN')}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedHistoryGuest && (
            <div className="border-t border-slate-900 bg-slate-950 p-3 sm:p-4">
              <div className="mb-2 text-2xs text-slate-500">
                Gửi tin tại đây sẽ tự chuyển phiên này sang chế độ admin trả lời.
              </div>
              <div className="flex gap-2 sm:gap-3">
                <input
                  value={guestReplyInput}
                  onChange={event => setGuestReplyInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onSendHistoryGuestReply();
                    }
                  }}
                  placeholder="Nhập tin nhắn admin gửi cho khách..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-rose-500 sm:px-4 sm:py-3"
                />
                <button
                  type="button"
                  onClick={onSendHistoryGuestReply}
                  disabled={!guestReplyInput.trim() || actionLoading === `guest-reply-${selectedHistoryGuest.session_id}`}
                  className="rounded-xl bg-rose-600 px-3 py-2.5 text-white hover:bg-rose-500 disabled:opacity-50 sm:px-4 sm:py-3"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-slate-500">
          Chọn một user/session bên trái để xem lịch sử chat.
        </div>
      )}
    </section>
  </div>

  <div className="hidden">
    {chatHistorySessions.map(session => {
      const isPublicSession = session.sessionId.startsWith('public-');
      const lastMessage = session.records[session.records.length - 1];
      return (
        <section key={session.sessionId} className="overflow-hidden rounded-2xl border border-slate-900 bg-slate-900/40">
          <div className="flex flex-col gap-2 border-b border-slate-900 bg-slate-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-2xs font-bold uppercase ${
                  isPublicSession ? 'bg-emerald-500/10 text-emerald-300' : 'bg-indigo-500/10 text-indigo-300'
                }`}>
                  {isPublicSession ? 'Public website' : 'CMS nội bộ'}
                </span>
                <span className="text-xs font-mono text-slate-500">{session.sessionId}</span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-400">
                {lastMessage?.message || 'Chưa có nội dung'}
              </p>
            </div>
            <div className="text-xs text-slate-500">
              {session.records.length} tin nhắn · {lastMessage ? new Date(lastMessage.created_at).toLocaleString('vi-VN') : ''}
            </div>
          </div>

          <div className="max-h-[520px] space-y-3 overflow-y-auto p-4 app-scroll">
            {session.records.map(record => (
              <div key={record.id} className={`flex ${record.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-3xl rounded-2xl px-4 py-3 text-sm leading-6 ${
                  record.role === 'user'
                    ? 'rounded-tr-none bg-rose-600 text-white'
                    : 'rounded-tl-none border border-slate-800 bg-slate-950 text-slate-200'
                }`}>
                  <MarkdownContent content={record.message} compact className="break-words" />
                  <div className={`mt-2 text-2xs ${record.role === 'user' ? 'text-rose-100' : 'text-slate-500'}`}>
                    {record.role === 'user' ? 'Khách/User' : 'AI'} · {new Date(record.created_at).toLocaleString('vi-VN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    })}

    {chatHistorySessions.length === 0 && (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
        Chưa có lịch sử chat phù hợp với bộ lọc hiện tại.
      </div>
    )}
  </div>
</div>
  );
}
