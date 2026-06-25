import type { ReportSection } from '../../types/leadMagnetContent';

export default function ReportSectionView({ section }: { section: ReportSection }) {
  if (section.kind === 'market-insight') {
    return (
      <section className="mb-10">
        <h2 className="text-xl font-bold text-slate-950">{section.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">{section.summary}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Động lực tăng trưởng</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
              {section.keyDrivers.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Điều cần kiểm tra</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
              {section.watchPoints.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-700">
          <span className="font-semibold text-slate-500">Nhà đầu tư phù hợp: </span>
          {section.investorFit}
        </p>
        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-rose-700">Rủi ro</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
            {section.risks.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  if (section.kind === 'budget-framework') {
    return (
      <section className="mb-10">
        <h2 className="text-xl font-bold text-slate-950">{section.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{section.intro}</p>
        <div className="mt-6 space-y-4">
          {section.tiers.map(tier => (
            <div key={tier.range} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-bold text-rose-700">{tier.range}</h3>
              <p className="mt-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-500">Loại tài sản phù hợp: </span>
                {tier.assetTypes.join(' · ')}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Ưu điểm</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-slate-700">
                    {tier.advantages.map(item => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Hạn chế</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-slate-700">
                    {tier.limitations.map(item => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (section.kind === 'remote-ops-risk') {
    return (
      <section className="mb-10">
        <h2 className="text-xl font-bold text-slate-950">{section.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{section.intro}</p>
        <div className="mt-6 space-y-4">
          {section.items.map(item => (
            <article key={item.topic} className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-bold text-slate-900">{item.topic}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{item.description}</p>
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-500">Giảm thiểu: </span>
                {item.mitigation}
              </p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-slate-950">{section.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{section.intro}</p>
      <div className="mt-6 space-y-5">
        {section.phases.map(phase => (
          <div key={phase.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-bold text-invest-blue">{phase.label}</h3>
            <ul className="mt-3 space-y-2">
              {phase.items.map(item => (
                <li key={item} className="flex gap-2 text-sm text-slate-700">
                  <span className="mt-0.5 text-rose-500" aria-hidden>☐</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
