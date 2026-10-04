import React, { useState } from 'react';
import { X, Zap, CheckCircle2, Sparkles, Send, Copy, ArrowRight, ShieldCheck, Tag } from 'lucide-react';
import type { Property } from '../../../types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
};

const SAMPLE_RAW_TEXT = `Chính chủ cần bán gấp lô đất B2-15 lô 45 KĐT Nam Hòa Xuân, mặt tiền đường 7.5m Minh Mạng, diện tích 100m2 (5x20), hướng Đông Nam mát mẻ, sổ hồng riêng sẵn sàng sang tên công chứng ngay. Giá bán nhanh 3.85 tỷ bớt lộc. Liên hệ chính chủ: 0905777594 xem đất trực tiếp.`;

export default function QuickPostModal({ isOpen, onClose, onSuccess, onNotify }: Props) {
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [parsedData, setParsedData] = useState<any | null>(null);

  if (!isOpen) return null;

  const handleQuickParse = async (textToParse = rawText) => {
    const text = textToParse.trim();
    if (!text) {
      onNotify('Vui lòng nhập hoặc dán nội dung tin nhắn trước.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/properties/quick-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setParsedData(json.data);
        onNotify('Bóc tách thông số và tạo Auto-SEO thành công!', 'success');
      } else {
        onNotify(json.message || 'Không thể bóc tách dữ liệu', 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Lỗi kết nối máy chủ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFillSample = () => {
    setRawText(SAMPLE_RAW_TEXT);
    handleQuickParse(SAMPLE_RAW_TEXT);
  };

  const handlePublish = async () => {
    if (!parsedData) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedData),
      });
      const json = await res.json();
      if (json.status === 'success') {
        onNotify(`🎉 Xuất bản thành công: ${json.data.title}`, 'success');
        onSuccess();
        onClose();
      } else {
        onNotify(json.message || 'Xuất bản thất bại', 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Lỗi khi lưu bất động sản', 'error');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white shadow-lg shadow-rose-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Đăng nhanh 1 chạm & Auto SEO Engine
                <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-2xs font-semibold text-rose-400 border border-rose-500/20">
                  AI + Regex NLP
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Dán tin nhắn Zalo / Facebook thô. Hệ thống tự bóc tách thông số, tạo SEO Title, Meta và Schema.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Step 1: Raw Text Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                1. Dán nội dung tin nhắn thô (Zalo, Facebook, SMS)
              </label>
              <button
                type="button"
                onClick={handleFillSample}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium underline"
              >
                + Dán thử mẫu BĐS Nam Hòa Xuân
              </button>
            </div>
            <textarea
              rows={4}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="Ví dụ: Bán đất B2-15 lô 45 Nam Hòa Xuân, đường 7.5m Minh Mạng, 100m2 (5x20), hướng Đông Nam, sổ đỏ sẵn. Giá 3.85 tỷ. LH 0905777594..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={loading || !rawText.trim()}
                onClick={() => handleQuickParse()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-600/20 hover:brightness-110 disabled:opacity-50 transition-all"
              >
                {loading ? (
                  <>Đang bóc tách NLP & Regex...</>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Phân tích & Tự động sinh SEO
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 2: Parsed Form Preview */}
          {parsedData && (
            <div className="space-y-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-5">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
                <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  2. Kết quả bóc tách & Chuẩn hóa Auto-SEO
                </h4>
                <span className="text-2xs text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                  Format: [Loại hình] [Block/Lô] [Dự án] - [Đường] - [DT] - [Giá]
                </span>
              </div>

              {/* Standard SEO Title */}
              <div className="space-y-1">
                <label className="text-2xs font-semibold uppercase text-slate-400">
                  SEO Title chuẩn hóa:
                </label>
                <input
                  type="text"
                  value={parsedData.title}
                  onChange={e => setParsedData({ ...parsedData, title: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-amber-300 outline-none focus:border-rose-500"
                />
              </div>

              {/* Grid attributes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-2xs font-medium text-slate-400">Dự án / Khu vực</label>
                  <input
                    type="text"
                    value={parsedData.project_name}
                    onChange={e => setParsedData({ ...parsedData, project_name: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-2xs font-medium text-slate-400">Block</label>
                  <input
                    type="text"
                    value={parsedData.block || ''}
                    placeholder="B2-XX"
                    onChange={e => setParsedData({ ...parsedData, block: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white font-bold text-rose-300"
                  />
                </div>
                <div>
                  <label className="text-2xs font-medium text-slate-400">Lô số</label>
                  <input
                    type="text"
                    value={parsedData.lot || ''}
                    placeholder="Lô YY"
                    onChange={e => setParsedData({ ...parsedData, lot: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-2xs font-medium text-slate-400">Tuyến đường</label>
                  <input
                    type="text"
                    value={parsedData.street || ''}
                    onChange={e => setParsedData({ ...parsedData, street: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-2xs font-medium text-slate-400">Diện tích (m²)</label>
                  <input
                    type="number"
                    value={parsedData.area}
                    onChange={e => setParsedData({ ...parsedData, area: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white font-semibold"
                  />
                </div>
                <div>
                  <label className="text-2xs font-medium text-slate-400">Giá bán (tỷ VND)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={parsedData.price}
                    onChange={e => setParsedData({ ...parsedData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-emerald-400 font-bold"
                  />
                </div>
                <div>
                  <label className="text-2xs font-medium text-slate-400">Hướng</label>
                  <input
                    type="text"
                    value={parsedData.direction}
                    onChange={e => setParsedData({ ...parsedData, direction: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-2xs font-medium text-slate-400">SĐT Liên hệ</label>
                  <input
                    type="text"
                    value={parsedData.contact_phone || ''}
                    placeholder="0905..."
                    onChange={e => setParsedData({ ...parsedData, contact_phone: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Meta Description */}
              <div className="space-y-1">
                <label className="text-2xs font-semibold uppercase text-slate-400">
                  Meta Description (Chuẩn SEO 160 ký tự):
                </label>
                <textarea
                  rows={2}
                  value={parsedData.meta_description}
                  onChange={e => setParsedData({ ...parsedData, meta_description: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>

              {/* Auto Generated Article Description */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-2xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Bài viết mô tả tự sinh (200 - 300 từ chống Thin / Duplicate Content):
                  </label>
                  <span className="text-2xs text-emerald-400 font-mono">
                    {parsedData.rich_description.split(/\s+/).length} từ
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={parsedData.rich_description}
                  onChange={e => setParsedData({ ...parsedData, rich_description: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 leading-relaxed font-sans"
                />
              </div>

              {/* Schema JSON-LD indicator */}
              <div className="flex items-center gap-2 text-2xs text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <Tag className="w-3.5 h-3.5 text-rose-400" />
                <span>
                  Đã tự động tạo <strong>JSON-LD Schema (RealEstateListing / SingleFamilyResidence)</strong> chuẩn Google Rich Snippets (Currency: VND, InStock, Đà Nẵng).
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 bg-slate-950/70">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            Đóng
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={publishing || !parsedData}
              onClick={handlePublish}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {publishing ? (
                <>Đang lưu BĐS...</>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  🚀 Xuất bản ngay (1-Click)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
