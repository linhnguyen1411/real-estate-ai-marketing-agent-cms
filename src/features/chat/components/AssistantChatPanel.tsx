import React from 'react';
import { Bot, Send, Trash2 } from 'lucide-react';
import type { AppSettings, AuthUser, ChatMessage } from '../../../types';

type Props = {
  currentUser: AuthUser;
  settings: AppSettings;
  chatMessages: ChatMessage[];
  userChatInput: string;
  setUserChatInput: (v: string) => void;
  actionLoading: string | null;
  canDeleteChatSession: (sessionUserId: string) => boolean;
  onDeleteChatSession: (sessionUserId: string, label: string) => void;
  onSend: () => void;
};

export default function AssistantChatPanel({
  currentUser,
  settings,
  chatMessages,
  userChatInput,
  setUserChatInput,
  actionLoading,
  canDeleteChatSession,
  onDeleteChatSession,
  onSend,
}: Props) {
  return (
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
        onClick={() => onDeleteChatSession(currentUser.id, 'trợ lý AI nội bộ')}
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
        onKeyDown={(e) => e.key === 'Enter' && onSend()}
        placeholder="Hỏi về khách hàng nóng nhất, gợi ý viết bài bán đất, tóm lược chiến dịch..."
        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
      />
      <button
        onClick={onSend}
        disabled={!userChatInput.trim() || actionLoading === 'chatbot-chat'}
        className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl p-3 shadow-md border border-rose-500 transition-all shrink-0"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  </div>
</div>
  );
}
