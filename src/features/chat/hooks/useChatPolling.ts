import { useEffect } from 'react';

type ChatPollMode = 'chatbot' | 'website-chat' | 'chat-history';

/**
 * Polls guest + history feeds while website-chat or chat-history is active.
 * Clears the interval on unmount / mode / selection change.
 */
export function useChatPolling(
  mode: ChatPollMode,
  selectedChatGuestId: string,
  refreshPublicGuestChats: (sessionId?: string) => void | Promise<void>,
  refreshChatHistoryRecords: () => void | Promise<void>,
) {
  useEffect(() => {
    if (!['website-chat', 'chat-history'].includes(mode)) return;
    void refreshPublicGuestChats(selectedChatGuestId);
    void refreshChatHistoryRecords();
    const timer = window.setInterval(() => {
      void refreshPublicGuestChats(selectedChatGuestId);
      void refreshChatHistoryRecords();
    }, 2500);
    return () => window.clearInterval(timer);
    // Intentionally omit refresh fns from deps — same pattern as host (stable session poll).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedChatGuestId]);
}
