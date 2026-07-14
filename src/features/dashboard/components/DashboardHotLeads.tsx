import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Customer } from '../../../types';
import { listCustomers } from '../../../services/api';

type Props = {
  onOpenCrm: () => void;
  onAskChatbot: (customerName: string) => void;
};

/** Owns its own hot-leads query — does not depend on App CRM state. */
export default function DashboardHotLeads({ onOpenCrm, onAskChatbot }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await listCustomers({ page: 1, limit: 50, sort: 'created_at_desc' });
        if (!cancelled) {
          setCustomers(
            result.items.filter(c => c.status === 'hot' && c.lead_score > 80).slice(0, 3),
          );
        }
      } catch {
        if (!cancelled) setCustomers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Khách hàng cần liên hệ khẩn cấp (Lead Score &gt; 80)</h3>
        <button
          type="button"
          onClick={onOpenCrm}
          className="text-rose-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1"
        >
          Tất cả khách hàng <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-slate-900 text-xs uppercase tracking-wider text-slate-500">
              <th className="py-3 px-4">Tên khách hàng</th>
              <th className="py-3 px-4">Nhu cầu & Vị trí</th>
              <th className="py-3 px-4">Ngân sách</th>
              <th className="py-3 px-4">Lead Score</th>
              <th className="py-3 px-4">AI tóm lược tóm tắt</th>
              <th className="py-3 px-4 text-right">Hành động khuyên dùng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900">
            {loading && (
              <tr>
                <td colSpan={6} className="py-6 px-4 text-xs text-slate-500">
                  Đang tải lead nóng…
                </td>
              </tr>
            )}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 px-4 text-xs text-slate-500">
                  Không có khách hàng hot với lead score &gt; 80 trong trang hiện tại.
                </td>
              </tr>
            )}
            {customers.map(cust => (
              <tr key={cust.id} className="hover:bg-slate-900/30 transition-all">
                <td className="py-3.5 px-4 font-bold text-white">{cust.name}</td>
                <td className="py-3.5 px-4">
                  <span className="text-rose-400 font-semibold">{cust.property_type}</span> ở{' '}
                  {cust.interested_area}
                </td>
                <td className="py-3.5 px-4 text-amber-400 font-mono font-semibold">{cust.budget} tỷ VND</td>
                <td className="py-3.5 px-4">
                  <span className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 font-extrabold font-mono text-xs">
                    {cust.lead_score} 🔥
                  </span>
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-400 max-w-xs truncate">{cust.ai_summary}</td>
                <td className="py-3.5 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => onAskChatbot(cust.name)}
                    className="text-xs bg-slate-950 border border-slate-800 hover:border-rose-500 hover:text-white px-3 py-1.5 rounded-lg transition-all"
                  >
                    Hỏi chatbot AI
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
