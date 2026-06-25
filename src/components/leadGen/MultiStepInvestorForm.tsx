import React, { useState } from 'react';

import { ChevronRight, Send } from 'lucide-react';

import type { LeadBudgetRange, LeadInterestType } from '../../types/investorLead';

import { submitInvestorLead } from '../../leadGen/api';



const INTERESTS: { id: LeadInterestType; label: string }[] = [

  { id: 'dat-nen', label: 'Đất nền' },

  { id: 'can-ho', label: 'Căn hộ' },

  { id: 'nha-pho', label: 'Nhà phố' },

  { id: 'du-an', label: 'Danh mục BĐS' },

];



const BUDGETS: { id: LeadBudgetRange; label: string }[] = [

  { id: 'under-3', label: 'Dưới 3 tỷ' },

  { id: '3-5', label: '3–5 tỷ' },

  { id: '5-10', label: '5–10 tỷ' },

  { id: 'over-10', label: 'Trên 10 tỷ' },

];



interface MultiStepInvestorFormProps {

  source?: string;

  magnetSlug?: string;

  submitLabel?: string;

  onSuccess?: (result: { access_token: string; investor_score: number }) => void;

  compact?: boolean;

}



export default function MultiStepInvestorForm({

  source = 'multi_step',

  magnetSlug,

  submitLabel = 'Nhận danh sách cơ hội đầu tư',

  onSuccess,

  compact = false,

}: MultiStepInvestorFormProps) {

  const [step, setStep] = useState(1);

  const [interest, setInterest] = useState<LeadInterestType | ''>('');

  const [budget, setBudget] = useState<LeadBudgetRange | ''>('');

  const [name, setName] = useState('');

  const [phone, setPhone] = useState('');

  const [email, setEmail] = useState('');

  const [city, setCity] = useState('Hà Nội');

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [message, setMessage] = useState('');



  const submit = async () => {

    if (!name.trim() || !phone.trim()) {

      setMessage('Vui lòng nhập họ tên và số điện thoại.');

      setStatus('error');

      return;

    }

    setStatus('loading');

    try {

      const result = await submitInvestorLead({

        name: name.trim(),

        phone: phone.trim(),

        email: email.trim() || undefined,

        city: city.trim(),

        interest_type: interest || undefined,

        budget_range: budget || undefined,

        source,

        magnet_slug: magnetSlug,

        form_type: 'multi_step',

        gaEvent: 'generate_lead',

      });

      setStatus('success');

      setMessage(`Đã ghi nhận! Điểm ưu tiên: ${result.investor_score}/100. Đội ngũ sẽ gửi tài liệu sớm nhất.`);

      onSuccess?.(result);

    } catch (error) {

      setStatus('error');

      setMessage(error instanceof Error ? error.message : 'Gửi thất bại');

    }

  };



  const inputClass =

    'box-border w-full min-w-0 max-w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-invest-cta';



  return (

    <div className={`box-border w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white ${compact ? 'p-4' : 'p-6 shadow-lg'}`}>

      <div className="mb-4 flex gap-2">

        {[1, 2, 3].map(n => (

          <div

            key={n}

            className={`h-1.5 flex-1 rounded-full ${step >= n ? 'bg-invest-blue' : 'bg-slate-200'}`}

          />

        ))}

      </div>



      {step === 1 && (

        <div>

          <h3 className="font-extrabold text-slate-950">Bạn quan tâm loại hình nào?</h3>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">

            {INTERESTS.map(item => (

              <button

                key={item.id}

                type="button"

                onClick={() => setInterest(item.id)}

                className={`min-w-0 rounded-lg border px-3 py-3 text-sm font-semibold transition ${

                  interest === item.id

                    ? 'border-invest-blue bg-invest-blue-muted text-invest-blue'

                    : 'border-slate-200 text-slate-700 hover:border-invest-blue/30'

                }`}

              >

                {item.label}

              </button>

            ))}

          </div>

          <button

            type="button"

            disabled={!interest}

            onClick={() => setStep(2)}

            className="btn-primary mt-4 flex w-full disabled:opacity-40"

          >

            Tiếp tục <ChevronRight className="h-4 w-4" />

          </button>

        </div>

      )}



      {step === 2 && (

        <div>

          <h3 className="font-extrabold text-slate-950">Ngân sách dự kiến?</h3>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">

            {BUDGETS.map(item => (

              <button

                key={item.id}

                type="button"

                onClick={() => setBudget(item.id)}

                className={`min-w-0 rounded-lg border px-3 py-3 text-sm font-semibold transition ${

                  budget === item.id

                    ? 'border-invest-blue bg-invest-blue-muted text-invest-blue'

                    : 'border-slate-200 text-slate-700 hover:border-invest-blue/30'

                }`}

              >

                {item.label}

              </button>

            ))}

          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">

            <button type="button" onClick={() => setStep(1)} className="min-w-0 flex-1 rounded-lg border py-3 text-sm font-semibold">

              Quay lại

            </button>

            <button

              type="button"

              disabled={!budget}

              onClick={() => setStep(3)}

              className="btn-primary flex min-w-0 flex-1 disabled:opacity-40"

            >

              Tiếp tục <ChevronRight className="h-4 w-4" />

            </button>

          </div>

        </div>

      )}



      {step === 3 && (

        <div>

          <h3 className="font-extrabold text-slate-950">Nhận danh sách cơ hội đầu tư</h3>

          <p className="mt-1 text-sm text-slate-500">Điền thông tin để nhận báo cáo & khung phân tích đầu tư.</p>

          <div className="mt-4 space-y-3">

            <input value={name} onChange={e => setName(e.target.value)} placeholder="Họ tên *" className={inputClass} />

            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Số điện thoại / Zalo *" className={inputClass} />

            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (nhận báo cáo PDF)" type="email" className={inputClass} />

            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Thành phố (vd: Hà Nội)" className={inputClass} />

          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">

            <button type="button" onClick={() => setStep(2)} className="min-w-0 flex-1 rounded-lg border py-3 text-sm font-semibold">

              Quay lại

            </button>

            <button

              type="button"

              disabled={status === 'loading'}

              onClick={submit}

              className="btn-cta flex min-w-0 flex-1 px-2 py-3 text-xs disabled:opacity-60 sm:text-sm"

            >

              <Send className="h-4 w-4 shrink-0" />

              <span className="text-center leading-tight">{status === 'loading' ? 'Đang gửi...' : submitLabel}</span>

            </button>

          </div>

        </div>

      )}



      {message && (

        <p className={`mt-3 text-sm ${status === 'success' ? 'text-invest-success' : 'text-invest-danger'}`}>

          {message}

        </p>

      )}

    </div>

  );

}

