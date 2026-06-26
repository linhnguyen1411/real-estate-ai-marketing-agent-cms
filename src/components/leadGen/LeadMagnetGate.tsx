import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Lock } from 'lucide-react';
import { getLeadMagnet, type LeadMagnetDefinition } from '../../leadGen/leadMagnets';
import { clearMagnetAccess, getMagnetAccess, storeMagnetAccess } from '../../leadGen/analytics';
import { fetchLeadMagnetContent, LeadMagnetAccessError, submitInvestorLead } from '../../leadGen/api';
import type { LeadMagnetContent } from '../../types/leadMagnetContent';
import { LEAD_MAGNET_DISCLAIMER } from '../../types/leadMagnetContent';
import InvestmentPlaybookView from './InvestmentPlaybookView';
import InvestmentReportView from './InvestmentReportView';
import ReportSectionView from './ReportSectionView';

interface LeadMagnetGateProps {
  magnet: LeadMagnetDefinition;
  token?: string | null;
  onUnlocked?: (token: string) => void;
}

function MagnetForm({
  magnet,
  onUnlocked,
  sessionExpired,
}: {
  magnet: LeadMagnetDefinition;
  onUnlocked: (token: string) => void;
  sessionExpired?: boolean;
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
      {sessionExpired && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Phiên truy cập không còn hiệu lực. Vui lòng điền lại thông tin để xem tài liệu.
        </p>
      )}
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

function SourceLabel({ label }: { label: string }) {
  return (
    <div className="mt-8 space-y-3 border-t border-slate-200 pt-4">
      <p className="text-xs leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-600">Nguồn dữ liệu:</span>{' '}
        {label}
      </p>
      <p className="text-xs leading-relaxed text-slate-500">{LEAD_MAGNET_DISCLAIMER}</p>
    </div>
  );
}

function MagnetContentBody({ content }: { content: LeadMagnetContent }) {
  if (content.type === 'investment-playbook') {
    return (
      <article className="max-w-none">
        <InvestmentPlaybookView content={content} />
      </article>
    );
  }

  if (content.type === 'investment-report') {
    return (
      <article className="max-w-none">
        <InvestmentReportView content={content} />
        <SourceLabel label={content.sourceLabel} />
      </article>
    );
  }

  if (content.type === 'report') {
    const sections = content.sections ?? [];
    return (
      <article className="max-w-none">
        {sections.map(section => (
          <ReportSectionView key={section.id} section={section} />
        ))}
        <SourceLabel label={content.sourceLabel} />
      </article>
    );
  }

  if (content.type === 'opportunity-framework') {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Nội dung playbook chưa tải được. Vui lòng tải lại trang.
      </div>
    );
  }

  if (content.type === 'map') {
    const zones = content.zones ?? [];
    return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <rect width="100" height="100" fill="#0f172a" />
          <text x="50" y="8" textAnchor="middle" fill="#94a3b8" fontSize="4">
            BẢN ĐỒ ĐẦU TƯ NAM ĐÀ NẴNG
          </text>
          {zones.map(zone => (
            <g key={zone.id}>
              <circle cx={zone.x} cy={zone.y} r="6" fill={zone.color} opacity="0.85" />
              <text x={zone.x} y={zone.y + 10} textAnchor="middle" fill="#e2e8f0" fontSize="3">
                {zone.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-slate-600">
        {zones.map(zone => (
          <li key={zone.id}>
            <span className="font-semibold text-slate-800">{zone.label}:</span> {zone.note}
          </li>
        ))}
      </ul>
      <SourceLabel label={content.sourceLabel} />
    </div>
    );
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      Không nhận dạng được định dạng tài liệu. Vui lòng tải lại trang hoặc mở khóa lại.
    </div>
  );
}

function MagnetContent({
  magnet,
  token,
  onTokenInvalid,
}: {
  magnet: LeadMagnetDefinition;
  token: string;
  onTokenInvalid: () => void;
}) {
  const [content, setContent] = useState<LeadMagnetContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchLeadMagnetContent(magnet.slug, token)
      .then(data => {
        if (!cancelled) setContent(data);
      })
      .catch(err => {
        if (cancelled) return;
        if (err instanceof LeadMagnetAccessError && err.requiresForm) {
          onTokenInvalid();
          return;
        }
        setError(err instanceof Error ? err.message : 'Không tải được nội dung');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [magnet.slug, token, onTokenInvalid]);

  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-500">Đang tải tài liệu...</div>;
  }

  if (error || !content) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {error || 'Không tải được nội dung tài liệu.'}
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
        <Download className="h-4 w-4" />
        Tài liệu đã mở khóa
      </div>
      <MagnetContentBody content={content} />
    </>
  );
}

export default function LeadMagnetGate({ magnet, token: initialToken, onUnlocked }: LeadMagnetGateProps) {
  const navigate = useNavigate();
  const [token, setToken] = useState(initialToken || getMagnetAccess(magnet.slug));
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (initialToken) setToken(initialToken);
  }, [initialToken]);

  const handleTokenInvalid = useCallback(() => {
    clearMagnetAccess(magnet.slug);
    setToken(null);
    setSessionExpired(true);
    navigate(window.location.pathname, { replace: true });
  }, [magnet.slug, navigate]);

  if (!token) {
    return (
      <MagnetForm
        magnet={magnet}
        sessionExpired={sessionExpired}
        onUnlocked={t => {
          setSessionExpired(false);
          setToken(t);
          onUnlocked?.(t);
        }}
      />
    );
  }

  return <MagnetContent magnet={magnet} token={token} onTokenInvalid={handleTokenInvalid} />;
}

export function useLeadMagnet(slug: string) {
  return getLeadMagnet(slug);
}
