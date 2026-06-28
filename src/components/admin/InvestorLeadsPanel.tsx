import React, { useEffect, useState } from 'react';
import { formatLeadBudget, formatLeadInterest, formatLeadSource } from '../../leadGen/leadLabels';
import { getLeadMagnet } from '../../leadGen/leadMagnets';
import { fetchInvestorLeads, updateInvestorLeadStatus } from '../../services/investorLeadsApi';
import type { InvestorLead } from '../../types/investorLead';

export default function InvestorLeadsPanel() {
  const [leads, setLeads] = useState<InvestorLead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchInvestorLeads()
      .then(setLeads)
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleStatus = async (id: string, status: InvestorLead['status']) => {
    await updateInvestorLeadStatus(id, status);
    load();
  };

  if (loading) {
    return <div className="p-6 text-slate-400">Đang tải leads đầu tư...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Leads đầu tư (Investor Funnel)</h2>
          <p className="text-xs text-slate-500">Sắp xếp theo Investor Score — ưu tiên khách Hà Nội, ngân sách cao</p>
        </div>
        <button type="button" onClick={load} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white">
          Làm mới
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Điểm</th>
              <th className="px-4 py-3">Khách</th>
              <th className="px-4 py-3">Liên hệ</th>
              <th className="px-4 py-3">Quan tâm</th>
              <th className="px-4 py-3">Nguồn</th>
              <th className="px-4 py-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => (
              <tr key={lead.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    lead.investor_score >= 80 ? 'bg-rose-500/20 text-rose-400' :
                    lead.investor_score >= 50 ? 'bg-amber-500/20 text-amber-400' :
                    'bg-slate-700 text-slate-300'
                  }`}>
                    {lead.investor_score}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-white">{lead.name}</td>
                <td className="px-4 py-3 text-slate-300">
                  <div>{lead.phone}</div>
                  {lead.email && <div className="text-xs text-slate-500">{lead.email}</div>}
                  {lead.city && <div className="text-xs text-slate-500">{lead.city}</div>}
                </td>
                <td className="px-4 py-3 text-slate-300 text-xs">
                  <div className="font-medium text-white">{formatLeadInterest(lead.interest_type)}</div>
                  <div className="mt-0.5 text-slate-400">{formatLeadBudget(lead.budget_range)}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {lead.short_link_slug ? (
                    <span title={`/s/${lead.short_link_slug}`}>Short link: /s/{lead.short_link_slug}</span>
                  ) : lead.magnet_slug ? (
                    <span title={lead.magnet_slug}>
                      {getLeadMagnet(lead.magnet_slug)?.title || lead.magnet_slug}
                    </span>
                  ) : (
                    formatLeadSource(lead.source)
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={lead.status}
                    onChange={e => handleStatus(lead.id, e.target.value as InvestorLead['status'])}
                    className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-white"
                  >
                    <option value="new">Mới</option>
                    <option value="contacted">Đã liên hệ</option>
                    <option value="qualified">Qualified</option>
                    <option value="closed">Chốt</option>
                    <option value="lost">Lost</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && (
          <p className="p-8 text-center text-slate-500">Chưa có lead đầu tư.</p>
        )}
      </div>
    </div>
  );
}
