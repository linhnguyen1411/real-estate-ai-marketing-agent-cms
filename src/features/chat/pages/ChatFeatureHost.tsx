import React, { useEffect, useState } from 'react';
import { Bot, MessageSquare, RefreshCw, Send, Trash2 } from 'lucide-react';
import MarkdownContent from '../../../components/MarkdownContent';
import { ASSISTANT_WELCOME_MESSAGE } from '../../../config/defaults';
import type { AppSettings, AuthUser, ChatHistoryRecord, ChatMessage, PublicChatGuest } from '../../../types';
import {
  deleteChatSession,
  getChatHistory,
  getPublicChatGuestHistory,
  getPublicChatGuests,
  sendAssistantMessage,
  sendPublicChatGuestMessage,
  updatePublicChatGuestAi,
} from '../../../services/api';

type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;
export type ChatMode = 'chatbot' | 'website-chat' | 'chat-history';

type Props = {
  mode: ChatMode;
  currentUser: AuthUser;
  onNotify: Notify;
  searchQuery?: string;
  canManageWebsiteChat: boolean;
  initialDraft?: string;
  settings: AppSettings;
};

export default function ChatFeatureHost({
  mode,
  currentUser,
  onNotify,
  searchQuery = '',
  canManageWebsiteChat,
  initialDraft = '',
  settings,
}: Props) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([ASSISTANT_WELCOME_MESSAGE]);
  const [userChatInput, setUserChatInput] = useState(initialDraft);
  const [chatHistoryRecords, setChatHistoryRecords] = useState<ChatHistoryRecord[]>([]);
  const [selectedChatHistorySessionId, setSelectedChatHistorySessionId] = useState<string | undefined>(undefined);
  const [publicChatGuests, setPublicChatGuests] = useState<PublicChatGuest[]>([]);
  const [selectedChatGuestId, setSelectedChatGuestId] = useState('');
  const [selectedGuestChatHistory, setSelectedGuestChatHistory] = useState<ChatHistoryRecord[]>([]);
  const [guestReplyInput, setGuestReplyInput] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (initialDraft) setUserChatInput(initialDraft);
  }, [initialDraft]);

  const reload = async () => {
    setReloading(true);
    try {
      const [historyRecords, guests, myChatHistory] = await Promise.all([
        getChatHistory().catch(() => []),
        getPublicChatGuests().catch(() => []),
        getChatHistory('mine').catch(() => []),
      ]);
      setChatHistoryRecords(historyRecords);
      setPublicChatGuests(guests);
      setSelectedChatGuestId(prev => prev || guests[0]?.session_id || '');
      if (myChatHistory.length > 0) {
        setChatMessages(
          myChatHistory
            .slice()
            .reverse()
            .map(item => ({
              role: item.role,
              content: item.message,
              timestamp: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            })),
        );
      }
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const refreshPublicGuestChats = async (sessionId = selectedChatGuestId) => {
    const guests = await getPublicChatGuests().catch(() => publicChatGuests);
    setPublicChatGuests(guests);
    if (!sessionId && guests[0]?.session_id) {
      setSelectedChatGuestId(guests[0].session_id);
      sessionId = guests[0].session_id;
    }
    if (sessionId) {
      setSelectedGuestChatHistory(await getPublicChatGuestHistory(sessionId).catch(() => []));
    }
  };

  const refreshChatHistoryRecords = async () => {
    setChatHistoryRecords(await getChatHistory().catch(() => chatHistoryRecords));
  };

  useEffect(() => {
    if (!['website-chat', 'chat-history'].includes(mode)) return;
    refreshPublicGuestChats(selectedChatGuestId);
    refreshChatHistoryRecords();
    const timer = window.setInterval(() => {
      refreshPublicGuestChats(selectedChatGuestId);
      refreshChatHistoryRecords();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [mode, selectedChatGuestId]);



  const handleSendChatbotMessage = async () => {
    if (!userChatInput.trim()) return;
    const userMsg: ChatMessage = {
      role: 'user',
      content: userChatInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    setUserChatInput('');
    setActionLoading('chatbot-chat');
    
    try {
      const assistantReply = await sendAssistantMessage(userMsg.content);
      setChatMessages(prev => [...prev, {
        role: 'model',
        content: assistantReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } catch (e: any) {
      onNotify(e.message || "Lỗi kết nối server AI.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleGuestAi = async (guest: PublicChatGuest) => {
    setActionLoading(`guest-ai-${guest.session_id}`);
    try {
      const nextEnabled = !Boolean(guest.ai_enabled);
      const updated = await updatePublicChatGuestAi(guest.session_id, nextEnabled);
      setPublicChatGuests(prev => prev.map(item => item.session_id === updated.session_id ? updated : item));
      onNotify(nextEnabled ? 'Đã bật lại AI cho khách này.' : 'Đã tắt AI, admin sẽ tự chat với khách.', 'success');
    } catch (error: any) {
      onNotify(error.message || 'Không thể cập nhật trạng thái AI.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendGuestReply = async () => {
    const message = guestReplyInput.trim();
    if (!selectedChatGuestId || !message) return;
    setActionLoading(`guest-reply-${selectedChatGuestId}`);
    try {
      const saved = await sendPublicChatGuestMessage(selectedChatGuestId, message);
      setSelectedGuestChatHistory(prev => [...prev, saved]);
      setGuestReplyInput('');
      await refreshPublicGuestChats(selectedChatGuestId);
    } catch (error: any) {
      onNotify(error.message || 'Không thể gửi tin nhắn cho khách.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendHistoryGuestReply = async () => {
    const message = guestReplyInput.trim();
    if (!selectedHistoryGuest || !message) return;
    setActionLoading(`guest-reply-${selectedHistoryGuest.session_id}`);
    try {
      await sendPublicChatGuestMessage(selectedHistoryGuest.session_id, message);
      setGuestReplyInput('');
      await refreshPublicGuestChats(selectedHistoryGuest.session_id);
      await refreshChatHistoryRecords();
    } catch (error: any) {
      onNotify(error.message || 'Không thể gửi tin nhắn cho khách.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const canDeleteChatSession = (sessionUserId: string) => {
    if (!currentUser) return false;
    if (sessionUserId.startsWith('public-')) {
      return currentUser.role === 'owner' || currentUser.role === 'company';
    }
    if (currentUser.role === 'owner') return true;
    if (currentUser.role === 'company') {
      if (sessionUserId === currentUser.id) return true;
      const sessionRecords = chatHistoryRecords.filter(record => record.user_id === sessionUserId);
      const companyId = sessionRecords[0]?.company_id;
      return !companyId || companyId === currentUser.company_id;
    }
    return sessionUserId === currentUser.id;
  };

  const applyDeletedChatSession = (sessionUserId: string) => {
    setChatHistoryRecords(prev => prev.filter(record => record.user_id !== sessionUserId));

    if (selectedChatHistorySessionId === sessionUserId) {
      setSelectedChatHistorySessionId('');
    }

    if (sessionUserId.startsWith('public-')) {
      const sessionId = sessionUserId.slice('public-'.length);
      setPublicChatGuests(prev => prev.filter(guest => guest.session_id !== sessionId));
      if (selectedChatGuestId === sessionId) {
        setSelectedChatGuestId('');
        setSelectedGuestChatHistory([]);
      }
    }

    if (sessionUserId === currentUser.id) {
      setChatMessages([ASSISTANT_WELCOME_MESSAGE]);
    }
  };

  const handleDeleteChatSession = async (sessionUserId: string, label = 'hội thoại này') => {
    if (!canDeleteChatSession(sessionUserId)) {
      onNotify('Bạn không có quyền xóa lịch sử chat này.', 'error');
      return;
    }

    if (!window.confirm(`Xóa toàn bộ lịch sử của ${label}? Thao tác này không thể hoàn tác.`)) {
      return;
    }

    setActionLoading(`delete-chat-${sessionUserId}`);
    try {
      const result = await deleteChatSession(sessionUserId);
      applyDeletedChatSession(sessionUserId);
      await refreshChatHistoryRecords();
      await refreshPublicGuestChats(selectedChatGuestId);
      onNotify(
        result.deletedMessages > 0 || result.guestDeleted
          ? 'Đã xóa lịch sử chat.'
          : 'Không còn tin nhắn để xóa trong phiên này.',
        'success'
      );
    } catch (error: any) {
      const message = error.message || 'Không thể xóa lịch sử chat.';
      onNotify(
        message.includes('404') || message.includes('rỗng')
          ? 'API xóa chat chưa sẵn sàng. Hãy restart dev server: npm run dev'
          : message,
        'error'
      );
    } finally {
      setActionLoading(null);
    }
  };


  const filteredChatHistoryRecords = chatHistoryRecords.filter(record => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return (
      record.user_id.toLowerCase().includes(normalizedQuery)
      || record.message.toLowerCase().includes(normalizedQuery)
      || record.role.toLowerCase().includes(normalizedQuery)
    );
  });
  const chatHistorySessions = Array.from(
    filteredChatHistoryRecords.reduce((groups, record) => {
      const sessionId = record.user_id;
      groups.set(sessionId, [...(groups.get(sessionId) || []), record]);
      return groups;
    }, new Map<string, ChatHistoryRecord[]>())
  ).map(([sessionId, records]) => ({
    sessionId,
    records: records.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    lastMessageAt: records.reduce((latest, record) => Math.max(latest, new Date(record.created_at).getTime()), 0)
  })).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  const selectedChatHistorySession = chatHistorySessions.find(session => session.sessionId === selectedChatHistorySessionId)
    ?? (selectedChatHistorySessionId === undefined && chatHistorySessions[0] ? chatHistorySessions[0] : undefined);
  const selectedHistoryGuest = selectedChatHistorySession?.sessionId.startsWith('public-')
    ? publicChatGuests.find(guest => `public-${guest.session_id}` === selectedChatHistorySession.sessionId)
    : undefined;

  if (mode === 'website-chat' && !canManageWebsiteChat) {
    return <div className="text-sm text-slate-500">Bạn không có quyền quản lý website chat.</div>;
  }

  return (
    <>
      {mode === 'chatbot' && (
<div className="space-y-6">
  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div>
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Bot className="w-5 h-5 text-rose-500" />
        Trợ lý AI nội bộ
      </h2>
      <p className="text-slate-400 text-sm">
        Hỏi đáp trực tiếp với AI nắm dữ liệu CRM, bất động sản và nội dung marketing trong hệ thống.
      </p>
    </div>
    {currentUser && canDeleteChatSession(currentUser.id) && (
      <button
        type="button"
        onClick={() => handleDeleteChatSession(currentUser.id, 'trợ lý AI nội bộ')}
        disabled={actionLoading === `delete-chat-${currentUser.id}`}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-300 hover:border-rose-500/60 disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
        Xóa lịch sử AI
      </button>
    )}
  </div>

  <div className="bg-slate-900/40 rounded-2xl border border-slate-900 flex flex-col h-[620px] overflow-hidden justify-between">
    <div className="p-4 bg-slate-950 border-b border-slate-900 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Bot className="w-5 h-5 text-rose-500" />
        <div>
          <div className="text-xs font-bold text-white">AI Real Estate Agent Consultant</div>
          <span className="text-2xs text-emerald-400">
            AI mode: {settings.ai_mode} • {settings.ai_mode === 'openai' ? settings.openai_model : settings.ai_mode === 'gemini' ? 'gemini-2.5-flash' : settings.ollama_model}
          </span>
        </div>
      </div>

      <div className="hidden lg:flex gap-2">
        {['Khách nào đang nóng nhất?', 'Mỹ Khê có căn nào bán?', 'Tóm tắt khách hàng Đỗ Ngọc Mạnh'].map((hint, idx) => (
          <button
            key={idx}
            onClick={() => setUserChatInput(hint)}
            className="bg-slate-900 text-slate-400 border border-slate-800 text-2xs px-2.5 py-1 rounded-lg hover:border-rose-500 hover:text-white transition-all"
          >
            {hint}
          </button>
        ))}
      </div>
    </div>

    <div className="flex-1 p-5 overflow-y-auto space-y-4 app-scroll">
      {chatMessages.map((msg, i) => (
        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`p-3.5 rounded-2xl max-w-xl text-xs space-y-1 ${
            msg.role === 'user'
              ? 'bg-rose-600 text-white ml-12 rounded-tr-none'
              : 'bg-slate-950/80 border border-slate-900 text-slate-200 mr-12 rounded-tl-none whitespace-pre-wrap leading-relaxed'
          }`}>
            <p>{msg.content}</p>
            <span className="block text-3xs text-slate-400 font-mono text-right pt-1">{msg.timestamp}</span>
          </div>
        </div>
      ))}

      {actionLoading === 'chatbot-chat' && (
        <div className="flex justify-start">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 text-slate-400 text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping delay-100"></span>
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping delay-200"></span>
            <span>AI Agent đang phân tích database dữ liệu thực tế...</span>
          </div>
        </div>
      )}
    </div>

    <div className="p-4 bg-slate-950 border-t border-slate-900/80 flex items-center gap-3">
      <input
        type="text"
        value={userChatInput}
        onChange={(e) => setUserChatInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSendChatbotMessage()}
        placeholder="Hỏi về khách hàng nóng nhất, gợi ý viết bài bán đất, tóm lược chiến dịch..."
        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
      />
      <button
        onClick={handleSendChatbotMessage}
        disabled={!userChatInput.trim() || actionLoading === 'chatbot-chat'}
        className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl p-3 shadow-md border border-rose-500 transition-all shrink-0"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  </div>
</div>
      )}
      {mode === 'website-chat' && canManageWebsiteChat && (
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
      onClick={() => refreshPublicGuestChats(selectedChatGuestId)}
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
                        onChange={() => handleToggleGuestAi(selectedGuest)}
                        className="h-4 w-4 accent-emerald-500"
                      />
                      AI tự trả lời
                    </label>
                    {canDeleteChatSession(`public-${selectedChatGuestId}`) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteChatSession(`public-${selectedChatGuestId}`, `khách ${selectedGuest.name}`)}
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
              onKeyDown={event => event.key === 'Enter' && handleSendGuestReply()}
              placeholder="Nhập tin nhắn admin gửi cho khách..."
              className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-rose-500"
            />
            <button
              type="button"
              onClick={handleSendGuestReply}
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
      )}
      {mode === 'chat-history' && (
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
      onClick={() => void reload()}
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
                  onClick={() => handleDeleteChatSession(
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
                  onChange={() => handleToggleGuestAi(selectedHistoryGuest)}
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
                      handleSendHistoryGuestReply();
                    }
                  }}
                  placeholder="Nhập tin nhắn admin gửi cho khách..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-rose-500 sm:px-4 sm:py-3"
                />
                <button
                  type="button"
                  onClick={handleSendHistoryGuestReply}
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
      )}
    </>
  );
}
