import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import type { LeadMagnetContentMeta } from '../../types/leadMagnetContent';

const SOURCE_LABELS: Record<LeadMagnetContentMeta['source'], string> = {
  'static-framework': 'static-framework',
  mixed: 'mixed',
  database: 'database',
};

const SOURCE_BADGE: Record<LeadMagnetContentMeta['source'], string> = {
  'static-framework': 'bg-amber-500/20 text-amber-300',
  mixed: 'bg-sky-500/20 text-sky-300',
  database: 'bg-emerald-500/20 text-emerald-300',
};

const TYPE_LABELS: Record<LeadMagnetContentMeta['contentType'], string> = {
  report: 'Báo cáo',
  'opportunity-framework': 'Khung nhóm cơ hội',
  map: 'Bản đồ',
};

async function fetchLeadMagnetContentMeta(): Promise<LeadMagnetContentMeta[]> {
  const response = await fetch('/api/lead-magnet-content');
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || 'Không tải được dữ liệu');
  return Array.isArray(json.data) ? json.data : [];
}

export default function LeadMagnetContentAdmin() {
  const [items, setItems] = useState<LeadMagnetContentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetchLeadMagnetContentMeta()
      .then(setItems)
      .catch(err => {
        setItems([]);
        setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Lead Magnet Content</h2>
          <p className="text-xs text-slate-500">
            Nguồn nội dung tài liệu đầu tư — hiện tại dùng khung phân tích tĩnh (static-framework).
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Làm mới
        </button>
      </div>

      {loading && <div className="p-6 text-slate-400">Đang tải...</div>}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Tài liệu</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Loại nội dung</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Số mục</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.slug} className="border-t border-slate-800 hover:bg-slate-900/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-white">
                      <FileText className="h-4 w-4 text-rose-400" />
                      <span className="max-w-xs">{item.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{item.slug}</td>
                  <td className="px-4 py-3 text-slate-300">{TYPE_LABELS[item.contentType]}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${SOURCE_BADGE[item.source]}`}>
                      {SOURCE_LABELS[item.source]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{item.itemCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        Tương lai: chuyển sang <code className="text-slate-400">database</code> khi nội dung lấy từ
        bảng properties / projects / market_reports trong PostgreSQL.
      </p>
    </div>
  );
}
