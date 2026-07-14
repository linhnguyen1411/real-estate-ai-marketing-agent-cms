import React from 'react';
import { MessageSquare, RefreshCw, Send, Trash2 } from 'lucide-react';
import MarkdownContent from '../../../components/MarkdownContent';
import type { ChatHistoryRecord, PublicChatGuest } from '../../../types';

type Props = {
  publicChatGuests: PublicChatGuest[];
  selectedChatGuestId: string;
  setSelectedChatGuestId: (id: string) => void;
  setGuestReplyInput: (v: string) => void;
  selectedGuestChatHistory: ChatHistoryRecord[];
  guestReplyInput: string;
  actionLoading: string | null;
  canDeleteChatSession: (sessionUserId: string) => boolean;
  onRefresh: () => void;
  onToggleGuestAi: (guest: PublicChatGuest) => void;
  onDeleteChatSession: (sessionUserId: string, label: string) => void;
  onSendGuestReply: () => void;
};

export default function WebsiteChatPanel({
  publicChatGuests,
  selectedChatGuestId,
  setSelectedChatGuestId,
  setGuestReplyInput,
  selectedGuestChatHistory,
  guestReplyInput,
  actionLoading,
  canDeleteChatSession,
  onRefresh,
  onToggleGuestAi,
  onDeleteChatSession,
  onSendGuestReply,
}: Props) {
  return (
<div className="space-y-6">
  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div>
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-rose-500" />
        Chat khách website
      </h2>
      <p className="text-slate-400 text-sm">
        Chọn từng khách đã nhập họ tên/số điện thoại để theo dõi hội thoại. Bỏ tick AI để admin tự chat trực tiếp với khách.
      </p>
    </div>
    <button
      type="button"
      onClick={onRefresh}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-rose-500/60"
    >
      <RefreshCw className="w-4 h-4" />
      Tải lại
    </button>
  </div>

  <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-slate-900 bg-slate-900/40 lg:grid-cols-[330px_1fr]">
    <aside className="border-b border-slate-900 bg-slate-950/70 lg:border-b-0 lg:border-r">
      <div className="border-b border-slate-900 p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Khách đã chat</div>
        <div className="mt-1 text-sm text-slate-300">{publicChatGuests.length} khách guest</div>
      </div>
      <div className="max-h-[560px] overflow-y-auto p-3 app-scroll">
        {publicChatGuests.map(guest => {
          const selected = selectedChatGuestId === guest.session_id;
          return (
            <button
              key={guest.session_id}
              type="button"
              onClick={() => {
                setSelectedChatGuestId(guest.session_id);
                setGuestReplyInput('');
              }}
              className={`mb-2 w-full rounded-xl border p-3 text-left transition-all ${
                selected
                  ? 'border-rose-500/50 bg-rose-500/10'
                  : 'border-slate-900 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-white">{guest.name}</div>
                  <div className="text-xs text-slate-500">{guest.phone}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold ${
                  Boolean(guest.ai_enabled) ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
                }`}>
                  {Boolean(guest.ai_enabled) ? 'AI' : 'Admin'}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{guest.last_message || 'Chưa có tin nhắn'}</p>
              <div className="mt-2 flex justify-between text-2xs text-slate-600">
                <span>{guest.message_count || 0} tin</span>
                <span>{guest.last_message_at ? new Date(guest.last_message_at).toLocaleString('vi-VN') : ''}</span>
              </div>
            </button>
          );
        })}
        {publicChatGuests.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500">
            Chưa có khách nào bắt đầu chat.
          </div>
        )}
      </div>
    </aside>

    <section className="flex min-w-0 flex-col">
      {selectedChatGuestId ? (
        <>
          {(() => {
            const selectedGuest = publicChatGuests.find(guest => guest.session_id === selectedChatGuestId);
            return (
              <div className="flex flex-col gap-3 border-b border-slate-900 bg-slate-950 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{selectedGuest?.name || 'Khách guest'}</div>
                  <div className="text-xs text-slate-500">{selectedGuest?.phone} · {selectedChatGuestId}</div>
                </div>
                {selectedGuest && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedGuest.ai_enabled)}
                        onChange={() => onToggleGuestAi(selectedGuest)}
                        className="h-4 w-4 accent-emerald-500"
                      />
                      AI tự trả lời
                    </label>
                    {canDeleteChatSession(`public-${selectedChatGuestId}`) && (
                      <button
                        type="button"
                        onClick={() => onDeleteChatSession(`public-${selectedChatGuestId}`, `khách ${selectedGuest.name}`)}
                        disabled={actionLoading === `delete-chat-public-${selectedChatGuestId}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:border-rose-500/60 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa hội thoại
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex-1 space-y-3 overflow-y-auto p-4 app-scroll">
            {selectedGuestChatHistory.map(record => (
              <div key={record.id} className={`flex ${record.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-3xl rounded-2xl px-4 py-3 text-sm leading-6 ${
                  record.role === 'user'
                    ? 'rounded-tl-none border border-slate-800 bg-slate-950 text-slate-200'
                    : 'rounded-tr-none bg-rose-600 text-white'
                }`}>
                  <MarkdownContent content={record.message} compact className="break-words" />
                  <div className={`mt-2 text-2xs ${record.role === 'user' ? 'text-slate-500' : 'text-rose-100'}`}>
                    {record.role === 'user' ? 'Khách' : 'AI/Admin'} · {new Date(record.created_at).toLocaleString('vi-VN')}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 border-t border-slate-900 bg-slate-950 p-4">
            <input
              value={guestReplyInput}
              onChange={event => setGuestReplyInput(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && onSendGuestReply()}
              placeholder="Nhập tin nhắn admin gửi cho khách..."
              className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-rose-500"
            />
            <button
              type="button"
              onClick={onSendGuestReply}
              disabled={!guestReplyInput.trim() || actionLoading === `guest-reply-${selectedChatGuestId}`}
              className="rounded-xl bg-rose-600 p-3 text-white hover:bg-rose-500 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-slate-500">
          Chọn một khách ở danh sách bên trái để mở hội thoại.
        </div>
      )}
    </section>
  </div>
</div>
  );
}
