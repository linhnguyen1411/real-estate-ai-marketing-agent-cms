import React, { useEffect, useState } from 'react';
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
import AssistantChatPanel from '../components/AssistantChatPanel';
import WebsiteChatPanel from '../components/WebsiteChatPanel';
import ChatHistoryPanel from '../components/ChatHistoryPanel';
import { useChatPolling } from '../hooks/useChatPolling';

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
  onCountsChanged?: () => void;
};

export default function ChatFeatureHost({
  mode,
  currentUser,
  onNotify,
  searchQuery = '',
  canManageWebsiteChat,
  initialDraft = '',
  settings,
  onCountsChanged,
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

  useChatPolling(mode, selectedChatGuestId, refreshPublicGuestChats, refreshChatHistoryRecords);



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
      onCountsChanged?.();
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
        <AssistantChatPanel
          currentUser={currentUser}
          settings={settings}
          chatMessages={chatMessages}
          userChatInput={userChatInput}
          setUserChatInput={setUserChatInput}
          actionLoading={actionLoading}
          canDeleteChatSession={canDeleteChatSession}
          onDeleteChatSession={handleDeleteChatSession}
          onSend={() => void handleSendChatbotMessage()}
        />
      )}
      {mode === 'website-chat' && canManageWebsiteChat && (
        <WebsiteChatPanel
          publicChatGuests={publicChatGuests}
          selectedChatGuestId={selectedChatGuestId}
          setSelectedChatGuestId={setSelectedChatGuestId}
          setGuestReplyInput={setGuestReplyInput}
          selectedGuestChatHistory={selectedGuestChatHistory}
          guestReplyInput={guestReplyInput}
          actionLoading={actionLoading}
          canDeleteChatSession={canDeleteChatSession}
          onRefresh={() => void refreshPublicGuestChats(selectedChatGuestId)}
          onToggleGuestAi={guest => void handleToggleGuestAi(guest)}
          onDeleteChatSession={handleDeleteChatSession}
          onSendGuestReply={() => void handleSendGuestReply()}
        />
      )}
      {mode === 'chat-history' && (
        <ChatHistoryPanel
          chatHistorySessions={chatHistorySessions}
          selectedChatHistorySession={selectedChatHistorySession}
          setSelectedChatHistorySessionId={setSelectedChatHistorySessionId}
          setGuestReplyInput={setGuestReplyInput}
          selectedHistoryGuest={selectedHistoryGuest}
          guestReplyInput={guestReplyInput}
          actionLoading={actionLoading}
          reloading={reloading}
          canDeleteChatSession={canDeleteChatSession}
          onReload={() => void reload()}
          onToggleGuestAi={guest => void handleToggleGuestAi(guest)}
          onDeleteChatSession={handleDeleteChatSession}
          onSendHistoryGuestReply={() => void handleSendHistoryGuestReply()}
        />
      )}
    </>
  );
}
