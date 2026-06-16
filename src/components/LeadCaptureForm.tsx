import React, { FormEvent, useState } from 'react';
import { Send } from 'lucide-react';
import { PRIMARY_CTA } from '../seo/siteConfig';
import { submitInvestorLead } from '../leadGen/api';

interface LeadCaptureFormProps {
  source?: string;
  defaultArea?: string;
  submitLabel?: string;
  compact?: boolean;
  magnetSlug?: string;
}

export default function LeadCaptureForm({
  source = 'website',
  defaultArea = 'Đà Nẵng',
  submitLabel = PRIMARY_CTA,
  compact = false,
  magnetSlug,
}: LeadCaptureFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [area, setArea] = useState(defaultArea);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setStatus('error');
      setMessage('Vui lòng nhập họ tên và số điện thoại.');
      return;
    }
    setStatus('loading');
    try {
      const result = await submitInvestorLead({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        city: area.trim(),
        budget_range: parseBudget(budget),
        source,
        magnet_slug: magnetSlug,
        form_type: 'simple',
        gaEvent: 'contact_submit',
      });
      setStatus('success');
      setMessage(`Đã ghi nhận! Điểm ưu tiên ${result.investor_score}/100 — đội ngũ sẽ gửi danh sách cơ hội đầu tư sớm nhất.`);
      setName('');
      setPhone('');
      setEmail('');
      setBudget('');
      setNote('');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Không gửi được. Vui lòng gọi hotline.');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`box-border w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white ${compact ? 'p-4' : 'p-6 shadow-lg'}`}
    >
      {!compact && (
        <div className="mb-4">
          <h3 className="text-lg font-extrabold text-slate-950">{submitLabel}</h3>
          <p className="mt-1 text-sm text-slate-600">
            Danh sách được lọc theo ngân sách và mục tiêu — miễn phí, không spam.
          </p>
        </div>
      )}
      <div className={`grid w-full min-w-0 gap-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Họ tên *"
          required
          className="box-border w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-invest-cta"
        />
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Số điện thoại / Zalo *"
          required
          className="box-border w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-invest-cta"
        />
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email (nhận báo cáo)"
          type="email"
          className="box-border w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-invest-cta"
        />
        <input
          value={budget}
          onChange={e => setBudget(e.target.value)}
          placeholder="Ngân sách (vd: 3–5 tỷ)"
          className="box-border w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-invest-cta"
        />
        <input
          value={area}
          onChange={e => setArea(e.target.value)}
          placeholder="Thành phố / Khu vực"
          className="box-border w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-invest-cta sm:col-span-2"
        />
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Mục tiêu đầu tư (dòng tiền, tích lũy, ở...)"
        rows={compact ? 2 : 3}
        className="mt-3 box-border w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-invest-cta"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="btn-cta mt-4 flex w-full disabled:opacity-60"
      >
        <Send className="h-4 w-4" />
        {status === 'loading' ? 'Đang gửi...' : submitLabel}
      </button>
      {message && (
        <p className={`mt-3 text-sm ${status === 'success' ? 'text-invest-success' : 'text-invest-danger'}`}>
          {message}
        </p>
      )}
    </form>
  );
}

function parseBudget(value: string) {
  const v = value.toLowerCase();
  if (v.includes('10') || v.includes('trên')) return 'over-10' as const;
  if (v.includes('5')) return '5-10' as const;
  if (v.includes('3')) return '3-5' as const;
  return 'under-3' as const;
}
