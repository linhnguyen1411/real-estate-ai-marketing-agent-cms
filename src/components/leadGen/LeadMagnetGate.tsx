import React, { useEffect, useState } from 'react';
import { X, Download, Lock } from 'lucide-react';
import { getLeadMagnet, type LeadMagnetDefinition } from '../../leadGen/leadMagnets';
import { getMagnetAccess, storeMagnetAccess } from '../../leadGen/analytics';
import { submitInvestorLead } from '../../leadGen/api';
import {
  TOP_20_OPPORTUNITIES,
  MARKET_REPORT_SECTIONS,
  INVESTMENT_MAP_ZONES,
} from '../../leadGen/leadMagnets';

interface LeadMagnetGateProps {
  magnet: LeadMagnetDefinition;
  token?: string | null;
  onUnlocked?: (token: string) => void;
}

function MagnetForm({
  magnet,
  onUnlocked,
}: {
  magnet: LeadMagnetDefinition;
  onUnlocked: (token: string) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !email.trim()) {
      setError('Vui lòng nhập đủ Tên, SĐT và Email.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await submitInvestorLead({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        source: `lead_magnet_${magnet.slug}`,
        magnet_slug: magnet.slug,
        form_type: 'lead_magnet',
        gaEvent: magnet.type === 'report' ? 'download_report' : 'ebook_download',
      });
      storeMagnetAccess(magnet.slug, result.access_token);
      onUnlocked(result.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-rose-200 bg-rose-50/50 p-6">
      <div className="mb-4 flex items-center gap-2 text-rose-700">
        <Lock className="h-5 w-5" />
        <span className="font-bold">Điền thông tin để tải tài liệu</span>
      </div>
      <div className="space-y-3">
        <input
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Họ tên *"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
        />
        <input
          required
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Số điện thoại *"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
        />
        <input
          required
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email *"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
        />
      </div>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        <Download className="h-4 w-4" />
        {loading ? 'Đang xử lý...' : magnet.cta}
      </button>
    </form>
  );
}

function MagnetContent({ magnet }: { magnet: LeadMagnetDefinition }) {
  if (magnet.slug === 'bao-cao-nam-da-nang-2026') {
    return (
      <article className="prose prose-slate max-w-none">
        {MARKET_REPORT_SECTIONS.map(section => (
          <section key={section.title} className="mb-8">
            <h2 className="text-xl font-bold text-slate-950">{section.title}</h2>
            <p className="mt-2 leading-7 text-slate-700">{section.body}</p>
          </section>
        ))}
      </article>
    );
  }

  if (magnet.slug === 'top-20-co-hoi-dau-tu') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Sản phẩm</th>
              <th className="py-2 pr-2">Khu vực</th>
              <th className="py-2 pr-2">Giá</th>
              <th className="py-2 pr-2">Tiềm năng</th>
              <th className="py-2">Đánh giá</th>
            </tr>
          </thead>
          <tbody>
            {TOP_20_OPPORTUNITIES.map(row => (
              <tr key={row.rank} className="border-b border-slate-100">
                <td className="py-2.5 font-bold text-rose-600">{row.rank}</td>
                <td className="py-2.5 font-medium">{row.name}</td>
                <td className="py-2.5 text-slate-600">{row.area}</td>
                <td className="py-2.5">{row.price}</td>
                <td className="py-2.5">{row.potential}</td>
                <td className="py-2.5 font-bold">{row.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-slate-500">* Dữ liệu tham khảo — liên hệ để nhận bản cập nhật mới nhất.</p>
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <rect width="100" height="100" fill="#0f172a" />
        <text x="50" y="8" textAnchor="middle" fill="#94a3b8" fontSize="4">
          BẢN ĐỒ ĐẦU TƯ NAM ĐÀ NẴNG
        </text>
        {INVESTMENT_MAP_ZONES.map(zone => (
          <g key={zone.id}>
            <circle cx={zone.x} cy={zone.y} r="6" fill={zone.color} opacity="0.85" />
            <text x={zone.x} y={zone.y + 10} textAnchor="middle" fill="#e2e8f0" fontSize="3">
              {zone.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function LeadMagnetGate({ magnet, token: initialToken, onUnlocked }: LeadMagnetGateProps) {
  const [token, setToken] = useState(initialToken || getMagnetAccess(magnet.slug));

  useEffect(() => {
    if (initialToken) setToken(initialToken);
  }, [initialToken]);

  if (!token) {
    return <MagnetForm magnet={magnet} onUnlocked={t => { setToken(t); onUnlocked?.(t); }} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
        <Download className="h-4 w-4" />
        Tài liệu đã mở khóa
      </div>
      <MagnetContent magnet={magnet} />
    </div>
  );
}

export function useLeadMagnet(slug: string) {
  return getLeadMagnet(slug);
}
