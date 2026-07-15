import React, { useEffect, useRef, useState } from 'react';
import { Check, MessageSquare, Send, Sparkles } from 'lucide-react';
import type { InboxMessage } from '../../../types';
import { generateInboxReply, listInbox, sendInboxReply } from '../../../services/api';
import { DEFAULT_PAGE_SIZE } from '../../../components/common/PaginationBar';

type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;

type Props = {
  onNotify: Notify;
  searchQuery?: string;
  onCountsChanged?: () => void;
};

export default function InboxPage({ onNotify, searchQuery = '', onCountsChanged }: Props) {
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [selectedInboxMessage, setSelectedInboxMessage] = useState<InboxMessage | null>(null);
  const [responseReplyText, setResponseReplyText] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const first = useRef(true);

  const load = async (search = searchQuery) => {
    setLoading(true);
    try {
      const result = await listInbox({
        page: 1,
        limit: DEFAULT_PAGE_SIZE,
        search: search.trim() || undefined,
      });
      setInbox(result.items);
    } catch (e: any) {
      onNotify(e.message || 'Không tải được inbox.', 'error');
      setInbox([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delay = first.current ? 0 : 350;
    first.current = false;
    const t = window.setTimeout(() => void load(searchQuery), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleAILiveReplySuggestion = async (msgId: string) => {
    setActionLoading(`reply-sugg-${msgId}`);
    try {
      const message = await generateInboxReply(msgId);
      onNotify("AI đã soạn thành công kịch bản trả lời khách!", "success");
      setInbox(prev => prev.map(m => m.id === msgId ? message : m));
      setResponseReplyText(message.ai_reply_suggestion || '');
    } catch (e: any) {
      onNotify(e.message || "Lỗi soạn kịch bản từ Ollama/Gemini.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendManualReply = async (msgId: string) => {
    if (!responseReplyText.trim()) {
      onNotify("Vui lòng điền nội dung câu trả lời", "error");
      return;
    }
    setActionLoading(`send-reply-${msgId}`);
    try {
      const message = await sendInboxReply(msgId, responseReplyText);
      onNotify("Đã gửi phản hồi thành công và cập nhật trạng thái đã xử lý!", "success");
      setInbox(prev => prev.map(m => m.id === msgId ? message : m));
      setSelectedInboxMessage(null);
      setResponseReplyText('');
      onCountsChanged?.();
    } catch (e: any) {
      onNotify(e.message || "Lỗi gửi.", "error");
    } finally {
      setActionLoading(null);
    }
  };


  return (
    <>
      {loading && <p className="text-xs text-slate-500">Đang tải inbox…</p>}
<div className="space-y-6">
  <div>
    <h2 className="text-xl font-bold text-white flex items-center gap-2">
      Hòm thư khách hàng đa kênh (Social Media Inbox)
    </h2>
    <p className="text-slate-400 text-sm">Giao diện tiếp quản tin nhắn Messenger, Zalo, bình luận Tiktok và Website Livechat.</p>
  </div>

  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
    {/* Message listing column */}
    <div className="lg:col-span-5 bg-slate-900/40 rounded-2xl border border-slate-900 overflow-hidden divide-y divide-slate-900/80 max-h-[600px] overflow-y-auto">
      <div className="p-4 bg-slate-950 font-bold text-xs uppercase tracking-wider text-slate-500">Hòm thư nhận trong ngày</div>
      
      {inbox.map((msg) => {
        const isSelected = selectedInboxMessage?.id === msg.id;
        return (
          <div 
            key={msg.id}
            onClick={() => {
              setSelectedInboxMessage(msg);
              setResponseReplyText(msg.ai_reply_suggestion || '');
            }}
            className={`p-4 cursor-pointer transition-all ${
              isSelected ? 'bg-rose-500/5 border-l-4 border-rose-500' : 'hover:bg-slate-900/30'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <img
                  src={msg.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=50&q=80"}
                  className="w-8 h-8 rounded-full object-cover border border-slate-800"
                />
                <div>
                  <div className="text-xs font-bold text-white leading-tight">{msg.sender_name}</div>
                  <span className="text-2xs text-rose-400 capitalize font-mono font-bold">{msg.platform} channel</span>
                </div>
              </div>

              <span className={`text-2xs px-2 py-0.5 rounded-full font-bold uppercase ${
                msg.intent === 'hỏi giá' ? 'bg-amber-600/20 text-amber-400' :
                msg.intent === 'thương lượng' ? 'bg-rose-600/20 text-rose-400 animate-pulse' :
                msg.intent === 'đặt lịch xem' ? 'bg-emerald-600/20 text-emerald-400' :
                'bg-slate-950 text-slate-500'
              }`}>
                {msg.intent || 'phân tích...'}
              </span>
            </div>

            <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
              {msg.message}
            </p>

            <div className="flex items-center justify-between mt-3 text-2xs font-mono text-slate-500">
              <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span className={msg.status === 'pending' ? 'text-rose-400 font-bold animate-pulse' : 'text-slate-500'}>
                {msg.status === 'replied' ? '✓ Đập hộp phản hồi' : '• Cần phản hồi'}
              </span>
            </div>
          </div>
        );
      })}
    </div>

    {/* Chat dialog workspace */}
    <div className="lg:col-span-7 bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-4">
      {selectedInboxMessage ? (
        <div className="space-y-4">
          <div className="border-b border-slate-900 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-md">Khung chat tiếp nhận: {selectedInboxMessage.sender_name}</h3>
              <p className="text-xs text-slate-500 font-mono capitalize">Nền tảng đồng bộ: {selectedInboxMessage.platform}</p>
            </div>
            <button onClick={() => setSelectedInboxMessage(null)} className="text-slate-500 hover:text-slate-300 text-xs">
              Đóng khung
            </button>
          </div>

          {/* Conversation flow */}
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-900 max-w-md">
              <span className="block text-2xs text-rose-400 font-semibold mb-1">Khách hàng gửi:</span>
              <p className="text-xs text-slate-200 leading-relaxed font-medium">{selectedInboxMessage.message}</p>
            </div>

            {selectedInboxMessage.ai_reply_suggestion && (
              <div className="p-3.5 bg-rose-950/20 rounded-xl border border-rose-500/20 max-w-md ml-auto">
                <span className="block text-2xs text-rose-400 font-bold mb-1 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Gợi ý AI soạn thảo tự động:
                </span>
                <p className="text-xs text-rose-100 whitespace-pre-line leading-relaxed italic">{selectedInboxMessage.ai_reply_suggestion}</p>
              </div>
            )}
          </div>

          {/* Quick reply typing text area */}
          <div className="space-y-3 pt-4 border-t border-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Giao diện trả lời của Admin</span>
              <button
                onClick={() => handleAILiveReplySuggestion(selectedInboxMessage.id)}
                disabled={actionLoading === `reply-sugg-${selectedInboxMessage.id}`}
                className="text-xs bg-slate-950 hover:bg-slate-900 border border-slate-800 text-rose-400 px-3 py-1.5 rounded-lg flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>{actionLoading === `reply-sugg-${selectedInboxMessage.id}` ? "Đang gõ..." : "AI soạn hộ câu trả lời"}</span>
              </button>
            </div>

            <textarea
              rows={4}
              value={responseReplyText}
              onChange={(e) => setResponseReplyText(e.target.value)}
              placeholder="Nhập nội dung phản hồi thủ công hoặc chỉnh sửa nội dung AI vừa hỗ trợ ở trên..."
              className="w-full bg-slate-950 border border-slate-900 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => handleSendManualReply(selectedInboxMessage.id)}
                disabled={actionLoading === `send-reply-${selectedInboxMessage.id}`}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1 shadow-md"
              >
                <Check className="w-3.5 h-3.5" /> Gửi Phản Hồi Demo
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
          <MessageSquare className="w-12 h-12 text-slate-700" />
          <p className="text-xs text-slate-500 max-w-sm">Chọn một tin nhắn bất kỳ từ danh sách bên trái để phản hồi, phân loại ý định hành vi, và sử dụng AI soạn kịch bản trả lời nhanh.</p>
        </div>
      )}
    </div>
  </div>
</div>
    </>
  );
}
