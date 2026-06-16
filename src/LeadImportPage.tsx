import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardPaste, Download, RefreshCw, Save } from 'lucide-react';
import type { AuthUser, LeadExtractResult } from './types';
import { bulkExtractLeads, bulkSaveLeads, getAuthToken, getCurrentUser } from './services/api';

const DEMAND_LABELS: Record<string, string> = {
  buy: 'Mua', sell: 'Bán', rent: 'Thuê', lease: 'Cho thuê', unknown: 'Chưa rõ'
};

type PreviewItem = LeadExtractResult & {
  index: number;
  is_duplicate?: boolean;
  duplicate_reason?: string;
  selected?: boolean;
};

export default function LeadImportPage() {
  const navigate = useNavigate();
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [rawText, setRawText] = useState('');
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!getAuthToken()) {
      navigate('/admin/login');
      return;
    }
    getCurrentUser()
      .then(setCurrentUser)
      .catch(() => navigate('/admin/login'))
      .finally(() => setAuthLoading(false));
  }, [navigate]);

  const handleExtract = async () => {
    if (!rawText.trim()) {
      showToast('Dán nội dung bài đăng trước.', 'error');
      return;
    }
    setLoading(true);
    try {
      const items = await bulkExtractLeads(rawText);
      setPreviews(items.map(item => ({ ...item, selected: !item.is_duplicate })));
      showToast(`Tách được ${items.length} lead`);
    } catch (err: any) {
      showToast(err.message || 'Tách lead thất bại', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSelected = async () => {
    const selected = previews.filter(p => p.selected);
    if (!selected.length) {
      showToast('Chọn ít nhất 1 lead để lưu.', 'error');
      return;
    }
    setLoading(true);
    try {
      const result = await bulkSaveLeads(selected, 'manual_import');
      showToast(`Đã lưu ${result.saved_count} lead, ${result.duplicate_count} trùng`);
      setPreviews(prev => prev.filter(p => !p.selected || result.results.some((r, i) => selected[i]?.index === p.index && !r.saved)));
    } catch (err: any) {
      showToast(err.message || 'Lưu hàng loạt thất bại', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = (checked: boolean) => {
    setPreviews(prev => prev.map(p => ({ ...p, selected: checked && !p.is_duplicate })));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-slate-950 text-slate-100 app-scroll">
      <header className="border-b border-slate-900 px-4 py-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link to="/admin/dashboard" className="p-2 rounded-lg border border-slate-800 hover:border-rose-500/40 text-slate-400">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Import Lead thủ công</h1>
            <p className="text-xs text-slate-400">Dán nhiều bài đăng — tách lead — preview — lưu CRM. Tách bằng dòng `---` hoặc khối SĐT.</p>
          </div>
        </div>
      </header>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border text-sm ${
          toast.type === 'error' ? 'bg-rose-950 border-rose-500/40 text-rose-100' : 'bg-emerald-950 border-emerald-500/40 text-emerald-100'
        }`}>{toast.message}</div>
      )}

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <label className="text-sm text-slate-400 flex items-center gap-2"><ClipboardPaste className="w-4 h-4" /> Dán nội dung nhiều bài</label>
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            rows={12}
            placeholder="Dán bài từ Facebook, Chợ Tốt, Zalo...&#10;---&#10;Bài tiếp theo..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={handleExtract} disabled={loading} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-bold flex items-center gap-2 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tách lead
            </button>
            {previews.length > 0 && (
              <>
                <button onClick={() => toggleAll(true)} className="px-3 py-2 rounded-xl border border-slate-700 text-xs">Chọn tất cả</button>
                <button onClick={handleSaveSelected} disabled={loading} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                  <Save className="w-4 h-4" /> Lưu lead đã chọn
                </button>
              </>
            )}
          </div>
        </section>

        {previews.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold flex items-center gap-2"><Download className="w-4 h-4 text-sky-400" /> Preview ({previews.length})</h2>
            {previews.map(item => (
              <div key={item.index} className={`rounded-xl border p-4 ${item.is_duplicate ? 'border-amber-500/30 bg-amber-950/10' : 'border-slate-800 bg-slate-900/40'}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(item.selected)}
                    onChange={e => setPreviews(prev => prev.map(p => p.index === item.index ? { ...p, selected: e.target.checked } : p))}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1 text-sm">
                    <div className="font-semibold text-white">{item.name}</div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                      <span>SĐT chính: <span className="text-emerald-300">{item.phone || '—'}</span></span>
                      {item.phones && item.phones.length > 1 && (
                        <span>SĐT khác: <span className="text-sky-300">{item.phones.slice(1).join(', ')}</span></span>
                      )}
                      {item.possible_phones && item.possible_phones.length > 0 && (
                        <span>Possible: <span className="text-amber-300">{item.possible_phones.join(', ')}</span></span>
                      )}
                      {item.confidence_score != null && item.confidence_score > 0 && (
                        <span>Confidence: +{item.confidence_score}</span>
                      )}
                      <span>Nhu cầu: {DEMAND_LABELS[item.demand_type] || item.demand_type}</span>
                      <span>Loại: {item.property_type}</span>
                      <span>Khu vực: {item.location}</span>
                      <span>Ngân sách: {item.budget > 0 ? `${item.budget} tỷ` : '—'}</span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">{item.ai_summary}</p>
                    {item.is_duplicate && <p className="text-xs text-amber-400">Trùng ({item.duplicate_reason})</p>}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {currentUser && <p className="text-xs text-slate-600">User: {currentUser.email}</p>}
      </main>
    </div>
  );
}
